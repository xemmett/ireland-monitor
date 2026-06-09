import asyncio
import hashlib
import json
import logging
import os
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import anthropic
import redis.asyncio as aioredis

from geocode import lookup as geocode_lookup

logger = logging.getLogger(__name__)

HAIKU_MODEL = "claude-haiku-4-5-20251001"
SEEN_HASHES_KEY = "seen_hashes"
SEEN_TTL = 7 * 24 * 3600  # 7 days

SEVERITY_ORDER = ["calm", "watch", "elevated", "high", "critical"]

KEYWORDS: dict[str, list[str]] = {
    "critical": [],
    "high": [
        "petrol bomb", "water cannon", "baton round", "arson",
        "vehicle torched", "officers injured", "gun", "shooting",
        "explosive", "bomb threat",
    ],
    "elevated": [
        "riot", "clashes", "masonry", "fireworks at police",
        "hijacked", "hijacking", "disorder", "trouble",
    ],
    "watch": [
        "gathering", "vigil", "march", "calls for protest",
        "appeal for calm", "demonstration", "rally", "parade",
    ],
}

CLASSIFY_PROMPT = """You are a civil-unrest OSINT triage filter for Ireland/Northern Ireland.
For each item return JSON only (array, same order as input, no extra text):
[{{"relevant": true/false, "severity": "calm|watch|elevated|high|critical", "location": "specific place name or town in Ireland/NI", "summary": "1 sentence, factual, NO names of private individuals", "confidence": 0.0-1.0}}]
Rules:
- relevant=true ONLY if about protest/riot/civil disorder/unrest actually in Ireland or Northern Ireland
- If article is about Ireland generally with no specific location, use "Ireland"
- Strip any personal data of private individuals from summaries
- Confidence reflects how certain you are this is a genuine civil unrest event
Items (JSON array):
{items}"""


@dataclass
class RawItem:
    title: str
    body: str
    url: str | None
    source: str
    source_type: str
    published_at: str | None


@dataclass
class Incident:
    id: str
    time: datetime
    first_seen: datetime
    title: str
    summary: str
    severity: str
    source: str
    source_type: str
    url: str | None
    location: str
    lat: float
    lng: float
    confidence: float
    cluster_id: str | None = None


def _normalise_text(text: str) -> str:
    text = text.lower().strip()
    text = unicodedata.normalize("NFD", text)
    text = re.sub(r"[^\w\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _raw_hash(title: str, day: str) -> str:
    key = _normalise_text(title) + day
    return hashlib.sha1(key.encode()).hexdigest()


def _incident_id(title: str, location: str, day: str) -> str:
    key = _normalise_text(title) + _normalise_text(location) + day
    return hashlib.sha1(key.encode()).hexdigest()


def _rules_floor(text: str) -> str:
    lower = text.lower()
    for level in reversed(SEVERITY_ORDER):
        if level in KEYWORDS and any(kw in lower for kw in KEYWORDS[level]):
            return level
    return "calm"


def _max_severity(a: str, b: str) -> str:
    ai = SEVERITY_ORDER.index(a) if a in SEVERITY_ORDER else 0
    bi = SEVERITY_ORDER.index(b) if b in SEVERITY_ORDER else 0
    return SEVERITY_ORDER[max(ai, bi)]


async def _haiku_classify(items: list[RawItem]) -> list[dict]:
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    payload = [{"title": it.title, "body": it.body[:300]} for it in items]
    try:
        msg = await client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": CLASSIFY_PROMPT.format(items=json.dumps(payload)),
                }
            ],
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        results = json.loads(text)
        if len(results) != len(items):
            logger.warning("Haiku returned %d results for %d items", len(results), len(items))
        return results
    except Exception as e:
        logger.error("Haiku classify failed: %s", e)
        return [{"relevant": False, "severity": "calm", "location": "", "summary": "", "confidence": 0.0}] * len(items)


async def enrich(
    raw_items: list[RawItem],
    redis_client: aioredis.Redis,
) -> list[Incident]:
    if not raw_items:
        return []

    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")

    # Filter already-seen hashes
    hashes = [_raw_hash(it.title, day) for it in raw_items]
    pipe = redis_client.pipeline()
    for h in hashes:
        pipe.sismember(SEEN_HASHES_KEY, h)
    seen_flags = await pipe.execute()

    new_items = [(item, h) for item, h, seen in zip(raw_items, hashes, seen_flags) if not seen]
    if not new_items:
        logger.debug("All %d items already seen", len(raw_items))
        return []

    logger.info("Enriching %d new items (filtered %d seen)", len(new_items), len(raw_items) - len(new_items))

    # Process in batches of 20
    incidents: list[Incident] = []
    batch_size = 20

    for batch_start in range(0, len(new_items), batch_size):
        batch = new_items[batch_start : batch_start + batch_size]
        batch_items = [item for item, _ in batch]
        batch_hashes = [h for _, h in batch]

        classifications = await _haiku_classify(batch_items)

        # Mark ALL evaluated items as seen immediately — whether relevant or not.
        # This prevents re-sending the same articles to Haiku every cycle.
        pipe = redis_client.pipeline()
        for h in batch_hashes:
            pipe.sadd(SEEN_HASHES_KEY, h)
        pipe.expire(SEEN_HASHES_KEY, SEEN_TTL)
        await pipe.execute()

        for raw, raw_hash, cls in zip(batch_items, batch_hashes, classifications):
            if not cls.get("relevant", False):
                continue

            llm_severity = cls.get("severity", "calm")
            if llm_severity not in SEVERITY_ORDER:
                llm_severity = "calm"
            combined_text = raw.title + " " + raw.body
            floor = _rules_floor(combined_text)
            final_severity = _max_severity(floor, llm_severity)

            location = cls.get("location", "").strip() or "Ireland"
            coords = await geocode_lookup(location, redis_client)
            if not coords:
                logger.debug("No coords for location %r, skipping", location)
                continue

            lat, lng = coords

            try:
                if raw.published_at:
                    time = datetime.fromisoformat(raw.published_at.replace("Z", "+00:00"))
                else:
                    time = now
            except Exception:
                time = now

            inc_id = _incident_id(raw.title, location, day)

            incidents.append(
                Incident(
                    id=inc_id,
                    time=time,
                    first_seen=now,
                    title=raw.title[:140],
                    summary=cls.get("summary", raw.title)[:500],
                    severity=final_severity,
                    source=raw.source,
                    source_type=raw.source_type,
                    url=raw.url,
                    location=location,
                    lat=lat,
                    lng=lng,
                    confidence=float(cls.get("confidence", 0.5)),
                )
            )

    logger.info("Enrichment produced %d incidents from %d items", len(incidents), len(new_items))
    return incidents
