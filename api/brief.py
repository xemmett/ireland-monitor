import json
from datetime import datetime, timezone

import redis.asyncio as aioredis

BRIEF_KEY = "brief:latest"

_EMPTY = {
    "situation": "No brief available yet. The first brief will be generated after the initial scrape cycle (up to 12 minutes).",
    "hotspots": [],
    "escalation_outlook": "Awaiting first data cycle.",
    "monitoring_priorities": [],
    "generated_at": None,
    "incident_count": 0,
}


async def get_brief(redis_client: aioredis.Redis) -> dict:
    cached = await redis_client.get(BRIEF_KEY)
    if cached:
        return json.loads(cached)
    return _EMPTY
