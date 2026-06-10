import json
import logging
import os
from datetime import datetime, timezone

from browser import cloak_page
from cookies import load_netscape_cookies
from enricher import RawItem

logger = logging.getLogger(__name__)

REDDIT_SEED = 1001
REDDIT_COOKIES_FILE = os.getenv("REDDIT_COOKIES_FILE", "/app/cookies/www.reddit.com_cookies.txt")
_REDDIT_COOKIES = load_netscape_cookies(REDDIT_COOKIES_FILE)
SUBREDDITS_AND_QUERIES = [
    ("https://www.reddit.com/r/northernireland/new.json?limit=25", "r/northernireland new"),
    ("https://www.reddit.com/r/belfast/new.json?limit=25", "r/belfast new"),
    ("https://www.reddit.com/r/northernireland/search.json?q=protest+riot+unrest+disorder&sort=new&limit=25", "r/northernireland search"),
    ("https://www.reddit.com/r/ireland/search.json?q=protest+riot+unrest+northern+ireland&sort=new&limit=25", "r/ireland search"),
]

# Headers that make Reddit treat the request as a browser XHR, not a page load
_HEADERS = {
    "Accept": "application/json, text/javascript, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}


async def fetch(since: datetime | None) -> list[RawItem]:
    items: list[RawItem] = []

    for url, label in SUBREDDITS_AND_QUERIES:
        try:
            async with cloak_page(seed=REDDIT_SEED, cookies=_REDDIT_COOKIES) as page:
                # Use page.request.get() — makes an XHR through the browser's
                # network stack (with stealth fingerprint) without triggering
                # Reddit's "use the app" interstitial page render.
                response = await page.request.get(url, headers=_HEADERS, timeout=20000)
                if response.status != 200:
                    logger.warning("Reddit %s: HTTP %d", label, response.status)
                    continue
                text = await response.text()

            data = json.loads(text)
            posts = data.get("data", {}).get("children", [])

            for post in posts:
                p = post.get("data", {})
                title = (p.get("title") or "").strip()
                selftext = (p.get("selftext") or "").strip()
                subreddit = p.get("subreddit", "northernireland")
                permalink = p.get("permalink", "")
                link = f"https://reddit.com{permalink}" if permalink else p.get("url", "")
                created = p.get("created_utc")
                pub = None
                if created:
                    pub = datetime.fromtimestamp(created, tz=timezone.utc).isoformat()

                if not title:
                    continue

                items.append(
                    RawItem(
                        title=title[:140],
                        body=f"{title}. {selftext}"[:800],
                        url=link,
                        source=f"Reddit/r/{subreddit}",
                        source_type="social",
                        published_at=pub,
                    )
                )

            logger.info("Reddit %s: %d posts", label, len(posts))
        except Exception as e:
            logger.warning("Reddit fetch failed (%s): %s", label, e)

    return items
