import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import anthropic
import asyncpg
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

BRIEF_KEY = "brief:latest"
BRIEF_MODEL = "claude-sonnet-4-6"

BRIEF_PROMPT = """You are an OSINT analyst for Ireland/Northern Ireland civil unrest monitoring.
Based on the following incidents from the last 24 hours, produce a JSON brief with EXACTLY this structure:
{{
  "situation": "2-3 sentence overall summary covering all of Ireland",
  "situation_ni": "1-2 sentence summary covering only Northern Ireland",
  "situation_roi": "1-2 sentence summary covering only the Republic of Ireland",
  "hotspots": [{{"location": "place name", "summary": "what is happening", "severity": "calm|watch|elevated|high|critical", "region": "NI|ROI"}}],
  "escalation_outlook": "brief all-Ireland assessment of likely trajectory in next 12-24 hours",
  "escalation_outlook_ni": "brief Northern Ireland-only outlook",
  "escalation_outlook_roi": "brief Republic of Ireland-only outlook",
  "monitoring_priorities": ["specific area or issue worth watching"],
  "generated_at": "ISO 8601 timestamp",
  "incident_count": 0
}}
Each incident below is tagged with its region (NI or ROI) — use this to tag each hotspot's "region" and to
write the NI-only and ROI-only situation/outlook fields. If a region has no notable activity, say so briefly
in its field (e.g. "No significant incidents reported.") rather than omitting it.
Return JSON only, no markdown fences. If there are no significant incidents anywhere, reflect that in all
situation/outlook fields and return an empty hotspots list.
Incidents (newest first):
{incidents}"""


async def get_recent_for_brief(pool: asyncpg.Pool) -> list[dict]:
    query = """
        SELECT time, title, summary, severity, source, location, country
        FROM incidents
        WHERE time >= now() - interval '24 hours'
        ORDER BY time DESC
        LIMIT 150
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query)
    return [dict(r) for r in rows]


async def generate_and_cache(pool: asyncpg.Pool, redis_client: aioredis.Redis):
    incidents = await get_recent_for_brief(pool)

    if not incidents:
        brief = {
            "situation": "No significant civil unrest incidents reported in Ireland/Northern Ireland in the last 24 hours.",
            "situation_ni": "No significant incidents reported.",
            "situation_roi": "No significant incidents reported.",
            "hotspots": [],
            "escalation_outlook": "Situation appears calm. Routine monitoring continues.",
            "escalation_outlook_ni": "Situation appears calm. Routine monitoring continues.",
            "escalation_outlook_roi": "Situation appears calm. Routine monitoring continues.",
            "monitoring_priorities": ["Maintain standard monitoring of all sources"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "incident_count": 0,
        }
        combined = {"all": brief, "ni": brief, "roi": brief}
        await redis_client.set(BRIEF_KEY, json.dumps(combined))
        await redis_client.publish("brief:updated", json.dumps(combined))
        return

    count_ni = sum(1 for r in incidents if r["country"] == "NI")
    count_roi = sum(1 for r in incidents if r["country"] == "ROI")

    items_text = "\n".join(
        f"[{r['time'].strftime('%H:%M')} | {r['severity'].upper()} | {r['country']} | {r['location']}] {r['title']}: {r['summary']}"
        for r in incidents[:100]
    )

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    try:
        msg = await client.messages.create(
            model=BRIEF_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": BRIEF_PROMPT.format(incidents=items_text)}],
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

        brief = json.loads(text)
        brief["generated_at"] = datetime.now(timezone.utc).isoformat()

        situation_ni = brief.pop("situation_ni", brief.get("situation", ""))
        situation_roi = brief.pop("situation_roi", brief.get("situation", ""))
        outlook_ni = brief.pop("escalation_outlook_ni", brief.get("escalation_outlook", ""))
        outlook_roi = brief.pop("escalation_outlook_roi", brief.get("escalation_outlook", ""))

        hotspots = brief.get("hotspots", [])
        hotspots_ni = [h for h in hotspots if h.get("region") == "NI"]
        hotspots_roi = [h for h in hotspots if h.get("region") == "ROI"]

        brief["incident_count"] = len(incidents)

        brief_ni = {
            **brief,
            "situation": situation_ni,
            "escalation_outlook": outlook_ni,
            "hotspots": hotspots_ni,
            "incident_count": count_ni,
        }
        brief_roi = {
            **brief,
            "situation": situation_roi,
            "escalation_outlook": outlook_roi,
            "hotspots": hotspots_roi,
            "incident_count": count_roi,
        }
        combined = {"all": brief, "ni": brief_ni, "roi": brief_roi}

        await redis_client.set(BRIEF_KEY, json.dumps(combined))
        await redis_client.publish("brief:updated", json.dumps(combined))
        logger.info("Brief generated and cached (%d incidents: %d NI, %d ROI)", len(incidents), count_ni, count_roi)
    except Exception as e:
        logger.error("Brief generation failed: %s", e)
