import email.utils
import logging
from datetime import datetime, timezone

import feedparser
import httpx

from enricher import RawItem

logger = logging.getLogger(__name__)

RSS_FEEDS: dict[str, tuple[str, str]] = {
    "BBC News NI":        ("https://feeds.bbci.co.uk/news/northern_ireland/rss.xml", "news"),
    "RTÉ News":           ("https://www.rte.ie/feeds/rss/?index=/news/&type=web", "news"),
    "Belfast Telegraph":  ("https://www.belfasttelegraph.co.uk/syndication/rss/news/", "news"),
    "Irish News":         ("https://www.irishnews.com/arc/outboundfeeds/rss/", "news"),
    "The Journal":        ("https://www.thejournal.ie/feed/", "news"),
    "PSNI":               ("https://www.psni.police.uk/news/Latest-News/rss/", "official"),
    "Irish Times":        ("https://www.irishtimes.com/cmlink/news-1.1319192", "news"),
    "Irish Independent":  ("https://www.independent.ie/irish-news/rss/", "news"),
}

HEADERS = {
    "User-Agent": "ni-unrest-monitor/1.0 (OSINT civil-unrest tracking)",
    "Accept": "application/rss+xml, application/xml, text/xml",
}


def _parse_date(entry) -> str | None:
    for field in ("published", "updated"):
        val = getattr(entry, field, None)
        if val:
            try:
                dt = email.utils.parsedate_to_datetime(val)
                return dt.isoformat()
            except Exception:
                pass
    return None


async def fetch(since: datetime | None) -> list[RawItem]:
    items: list[RawItem] = []

    async with httpx.AsyncClient(headers=HEADERS, timeout=15.0, follow_redirects=True) as client:
        for source_name, (url, source_type) in RSS_FEEDS.items():
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                feed = feedparser.parse(resp.text)
                count = 0
                for entry in feed.entries[:50]:
                    title = (getattr(entry, "title", "") or "").strip()
                    summary = (getattr(entry, "summary", "") or getattr(entry, "description", "") or "").strip()
                    link = getattr(entry, "link", None)
                    pub = _parse_date(entry)

                    if not title:
                        continue

                    items.append(
                        RawItem(
                            title=title[:140],
                            body=f"{title}. {summary}"[:800],
                            url=link,
                            source=source_name,
                            source_type=source_type,
                            published_at=pub,
                        )
                    )
                    count += 1
                logger.info("RSS %s: %d entries", source_name, count)
            except Exception as e:
                logger.warning("RSS fetch failed for %s (%s): %s", source_name, url, e)

    return items
