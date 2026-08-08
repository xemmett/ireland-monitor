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
    # PSNI feed retired in the site migration: /news/Latest-News/rss/ now 301s to the
    # HTML latest-news page, which feedparser reads as 0 entries. Re-add if a real
    # feed URL turns up.
    "Irish Times":        ("https://www.irishtimes.com/cmlink/news-1.1319192", "news"),
    "Irish Independent":  ("https://www.independent.ie/irish-news/rss/", "news"),
}

# ponytail: browser UA, not a polite bot string — RTÉ/Belfast Telegraph WAFs 403 the
# honest one and Irish News/Irish Times 429 it.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
}

# url -> conditional-request headers from the last successful fetch. Keeps the
# 12-minute poll from re-pulling unchanged feeds, which is half of what earns the 429s.
_CONDITIONAL: dict[str, dict[str, str]] = {}


def _conditional_headers(resp_headers) -> dict[str, str]:
    out = {}
    if etag := resp_headers.get("etag"):
        out["If-None-Match"] = etag
    if last_mod := resp_headers.get("last-modified"):
        out["If-Modified-Since"] = last_mod
    return out


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
                resp = await client.get(url, headers=_CONDITIONAL.get(url, {}))
                if resp.status_code == 304:
                    logger.info("RSS %s: not modified", source_name)
                    continue
                resp.raise_for_status()
                _CONDITIONAL[url] = _conditional_headers(resp.headers)
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
                if count == 0:
                    logger.warning(
                        "RSS %s: 0 entries — feed may be dead (final url=%s, content-type=%s)",
                        source_name, resp.url, resp.headers.get("content-type", "?"),
                    )
                else:
                    logger.info("RSS %s: %d entries", source_name, count)
            except Exception as e:
                logger.warning("RSS fetch failed for %s (%s): %s", source_name, url, e)

    return items
