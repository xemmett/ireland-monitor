import logging
import os
from datetime import datetime, timezone

from browser import cloak_page
from enricher import RawItem

logger = logging.getLogger(__name__)

# Set via TELEGRAM_CHANNELS env var (comma-separated, no @)
# Example: TELEGRAM_CHANNELS=nichannel1,nichannel2
_CHANNELS_ENV = os.getenv("TELEGRAM_CHANNELS", "")
CHANNELS: list[str] = [c.strip() for c in _CHANNELS_ENV.split(",") if c.strip()]


async def fetch(since: datetime | None) -> list[RawItem]:
    if not CHANNELS:
        logger.debug("No Telegram channels configured, skipping")
        return []

    items: list[RawItem] = []

    for channel in CHANNELS:
        seed = (hash(channel) % 90000) + 10000
        try:
            async with cloak_page(seed=seed) as page:
                await page.goto(
                    f"https://t.me/s/{channel}",
                    wait_until="domcontentloaded",
                    timeout=20000,
                )
                posts = await page.locator(".tgme_widget_message").all()
                count = 0
                for post in posts[-20:]:
                    try:
                        text_els = post.locator(".tgme_widget_message_text")
                        if await text_els.count() == 0:
                            continue
                        text = await text_els.first.inner_text()
                        text = text.strip()
                        if not text:
                            continue

                        ts = None
                        time_el = post.locator("time")
                        if await time_el.count() > 0:
                            ts = await time_el.first.get_attribute("datetime")

                        items.append(
                            RawItem(
                                title=text[:140],
                                body=text[:800],
                                url=f"https://t.me/{channel}",
                                source=f"Telegram/{channel}",
                                source_type="social",
                                published_at=ts,
                            )
                        )
                        count += 1
                    except Exception as inner_e:
                        logger.debug("Error parsing Telegram post in %s: %s", channel, inner_e)

            logger.info("Telegram/%s: %d messages", channel, count)
        except Exception as e:
            logger.warning("Telegram fetch failed for %s: %s", channel, e)

    return items
