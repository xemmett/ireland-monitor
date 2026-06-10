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


async def get_brief(redis_client: aioredis.Redis, region: str = "all") -> dict:
    cached = await redis_client.get(BRIEF_KEY)
    if cached:
        data = json.loads(cached)
        if region in data:
            return data[region]
        # Legacy single-region brief cached before the all-Ireland expansion —
        # self-heals once the worker publishes the next {all,ni,roi} brief.
        if "situation" in data:
            return data
    return _EMPTY
