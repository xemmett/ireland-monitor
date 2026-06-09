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
  "situation": "2-3 sentence overall summary of current situation",
  "hotspots": [{{"location": "place name", "summary": "what is happening", "severity": "calm|watch|elevated|high|critical"}}],
  "escalation_outlook": "brief assessment of likely trajectory in next 12-24 hours",
  "monitoring_priorities": ["specific area or issue worth watching"],
  "generated_at": "ISO 8601 timestamp",
  "incident_count": 0
}}
Return JSON only, no markdown fences. If there are no significant incidents, reflect that in the situation field.
Incidents (newest first):
{incidents}"""


async def get_recent_for_brief(pool: asyncpg.Pool) -> list[dict]:
    query = """
        SELECT time, title, summary, severity, source, location
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
            "hotspots": [],
            "escalation_outlook": "Situation appears calm. Routine monitoring continues.",
            "monitoring_priorities": ["Maintain standard monitoring of all sources"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "incident_count": 0,
        }
        await redis_client.set(BRIEF_KEY, json.dumps(brief))
        return

    items_text = "\n".join(
        f"[{r['time'].strftime('%H:%M')} | {r['severity'].upper()} | {r['location']}] {r['title']}: {r['summary']}"
        for r in incidents[:100]
    )

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    try:
        msg = await client.messages.create(
            model=BRIEF_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": BRIEF_PROMPT.format(incidents=items_text)}],
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

        brief = json.loads(text)
        brief["generated_at"] = datetime.now(timezone.utc).isoformat()
        brief["incident_count"] = len(incidents)
        await redis_client.set(BRIEF_KEY, json.dumps(brief))
        logger.info("Brief generated and cached (%d incidents)", len(incidents))
    except Exception as e:
        logger.error("Brief generation failed: %s", e)
