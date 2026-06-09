import logging
from datetime import datetime, timezone
from urllib.parse import quote

import httpx

from enricher import RawItem

logger = logging.getLogger(__name__)

GDELT_QUERY = (
    '(protest OR riot OR unrest OR disorder OR "anti-immigration" OR demonstration) '
    '(Belfast OR "Northern Ireland" OR Ballymena OR Larne OR Derry OR Antrim OR Ireland)'
)
GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"


async def fetch(since: datetime | None) -> list[RawItem]:
    params = {
        "query": GDELT_QUERY,
        "mode": "artlist",
        "maxrecords": "75",
        "format": "json",
        "timespan": "30min",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(GDELT_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error("GDELT fetch failed: %s", e)
        return []

    articles = data.get("articles", [])
    items: list[RawItem] = []

    for art in articles:
        title = (art.get("title") or "").strip()
        if not title:
            continue
        items.append(
            RawItem(
                title=title[:140],
                body=title,
                url=art.get("url"),
                source="GDELT",
                source_type="news",
                published_at=art.get("seendate"),
            )
        )

    logger.info("GDELT: fetched %d articles", len(items))
    return items
