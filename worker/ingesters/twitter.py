import logging
from datetime import datetime, timezone
from urllib.parse import quote

from browser import cloak_page
from enricher import RawItem

logger = logging.getLogger(__name__)

TWITTER_SEED = 9001
SEARCHES = [
    "Belfast riot OR disorder",
    "Northern Ireland protest",
    "Ballymena unrest",
    "PSNI disorder",
    "Belfast march OR demonstration",
]


async def fetch(since: datetime | None) -> list[RawItem]:
    items: list[RawItem] = []

    for query in SEARCHES:
        try:
            encoded = quote(query)
            url = f"https://x.com/search?q={encoded}&f=live"

            async with cloak_page(seed=TWITTER_SEED) as page:
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                # Wait for tweet articles to load
                try:
                    await page.wait_for_selector("article[data-testid='tweet']", timeout=8000)
                except Exception:
                    logger.debug("No tweets found for query: %s", query)
                    continue

                tweet_els = await page.locator("article[data-testid='tweet']").all()

                for el in tweet_els[:10]:
                    try:
                        text_el = el.locator("[data-testid='tweetText']")
                        if await text_el.count() == 0:
                            continue
                        text = await text_el.first.inner_text()
                        text = text.strip()
                        if not text:
                            continue

                        time_el = el.locator("time")
                        ts = None
                        if await time_el.count() > 0:
                            ts = await time_el.first.get_attribute("datetime")

                        items.append(
                            RawItem(
                                title=text[:140],
                                body=text[:800],
                                url=None,
                                source="X/Twitter",
                                source_type="social",
                                published_at=ts,
                            )
                        )
                    except Exception:
                        continue

            logger.info("Twitter search '%s': %d tweets", query, len(items))
        except Exception as e:
            logger.warning("Twitter fetch failed for %r: %s", query, e)

    return items
