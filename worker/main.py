import asyncio
import logging
import os
import sys

import asyncpg
import redis.asyncio as aioredis
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from brief import generate_and_cache
from enricher import RawItem, enrich
from storage import ensure_schema, expire_old, find_cluster, update_source_status, upsert_incident

from ingesters import gdelt, rss, reddit, telegram_pub, twitter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

INTERVAL = int(os.getenv("SCRAPE_INTERVAL_MINUTES", "12"))
DB_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

_pool: asyncpg.Pool | None = None
_redis: aioredis.Redis | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DB_URL, min_size=2, max_size=5, command_timeout=30)
    return _pool


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis


async def collect_all() -> list[RawItem]:
    """Run all ingesters and collect raw items, tracking source status."""
    redis_client = get_redis()
    all_items: list[RawItem] = []

    ingesters = [
        ("GDELT", gdelt.fetch),
        ("RSS", rss.fetch),
        ("Reddit", reddit.fetch),
        ("Telegram", telegram_pub.fetch),
        ("Twitter", twitter.fetch),
    ]

    for name, fetcher in ingesters:
        try:
            items = await fetcher(since=None)
            all_items.extend(items)
            await update_source_status(redis_client, name, "live", count=len(items))
            logger.info("Ingester %s: %d items", name, len(items))
        except Exception as e:
            logger.error("Ingester %s failed: %s", name, e)
            await update_source_status(redis_client, name, "error", error=str(e))

    logger.info("Total raw items collected: %d", len(all_items))
    return all_items


async def cycle():
    logger.info("=== Scrape cycle starting ===")
    pool = await get_pool()
    redis_client = get_redis()

    try:
        raw_items = await collect_all()

        incidents = await enrich(raw_items, redis_client)

        inserted_count = 0
        for inc in incidents:
            cluster_id = await find_cluster(pool, inc.lat, inc.lng, inc.time, inc.title)
            inc.cluster_id = cluster_id or inc.id

            inserted = await upsert_incident(pool, inc)
            if inserted:
                inserted_count += 1
                # Publish to SSE subscribers
                payload = {
                    "id": inc.id,
                    "time": inc.time.isoformat(),
                    "first_seen": inc.first_seen.isoformat(),
                    "title": inc.title,
                    "summary": inc.summary,
                    "severity": inc.severity,
                    "source": inc.source,
                    "source_type": inc.source_type,
                    "url": inc.url,
                    "location": inc.location,
                    "lat": inc.lat,
                    "lng": inc.lng,
                    "country": inc.country,
                    "confidence": inc.confidence,
                    "cluster_id": inc.cluster_id,
                }
                import json
                await redis_client.publish("incidents:new", json.dumps(payload))

        await expire_old(pool)

        # Only regenerate the brief (Sonnet call) when there's something new to report
        if inserted_count > 0:
            await generate_and_cache(pool, redis_client)

        logger.info("=== Cycle done: %d new incidents inserted ===", inserted_count)

    except Exception as e:
        logger.error("Cycle failed: %s", e, exc_info=True)


async def main():
    logger.info("Worker starting, interval=%dm", INTERVAL)

    # Wait for DB to be ready
    for attempt in range(30):
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.execute("SELECT 1")
            logger.info("DB connected")
            break
        except Exception as e:
            logger.warning("DB not ready (attempt %d): %s", attempt + 1, e)
            await asyncio.sleep(3)
    else:
        logger.error("Could not connect to DB after 30 attempts, exiting")
        sys.exit(1)

    await ensure_schema(pool)

    # Run an immediate cycle on startup
    await cycle()

    scheduler = AsyncIOScheduler()
    scheduler.add_job(cycle, "interval", minutes=INTERVAL, jitter=120)
    scheduler.start()

    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
        logger.info("Worker shutting down")


if __name__ == "__main__":
    asyncio.run(main())
