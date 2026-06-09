import json
import logging
from datetime import datetime, timezone

import asyncpg
import redis.asyncio as aioredis
from rapidfuzz import fuzz

from enricher import Incident

logger = logging.getLogger(__name__)


async def find_cluster(
    pool: asyncpg.Pool, lat: float, lng: float, time: datetime, title: str
) -> str | None:
    query = """
        SELECT id, title, cluster_id
        FROM incidents
        WHERE ST_DWithin(
            geom,
            ST_MakePoint($1, $2)::geography,
            2000
        )
        AND time BETWEEN $3::timestamptz - interval '6 hours' AND $3::timestamptz + interval '6 hours'
        ORDER BY time DESC
        LIMIT 10
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, lng, lat, time)

    for row in rows:
        ratio = fuzz.token_set_ratio(title.lower(), row["title"].lower())
        if ratio > 82:
            return row["cluster_id"] or row["id"]
    return None


async def upsert_incident(pool: asyncpg.Pool, incident: Incident) -> bool:
    query = """
        INSERT INTO incidents
            (id, time, first_seen, title, summary, severity, source, source_type,
             url, location, geom, confidence, cluster_id, raw_hash)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, ST_MakePoint($12, $11)::geography, $13, $14, $1)
        ON CONFLICT (id) DO NOTHING
    """
    try:
        async with pool.acquire() as conn:
            result = await conn.execute(
                query,
                incident.id,
                incident.time,
                incident.first_seen,
                incident.title,
                incident.summary,
                incident.severity,
                incident.source,
                incident.source_type,
                incident.url,
                incident.location,
                incident.lat,
                incident.lng,
                incident.confidence,
                incident.cluster_id,
            )
        return result == "INSERT 0 1"
    except asyncpg.UniqueViolationError:
        return False
    except Exception as e:
        logger.error("upsert_incident failed for %s: %s", incident.id, e)
        return False


async def expire_old(pool: asyncpg.Pool):
    query = "DELETE FROM incidents WHERE first_seen < now() - interval '30 days'"
    async with pool.acquire() as conn:
        result = await conn.execute(query)
    count = int(result.split()[-1]) if result else 0
    if count:
        logger.info("Expired %d old incidents", count)


async def update_source_status(
    redis_client: aioredis.Redis,
    source: str,
    status: str,
    count: int = 0,
    error: str | None = None,
):
    data = {
        "status": status,
        "last_run": datetime.now(timezone.utc).isoformat(),
        "count": count,
    }
    if error:
        data["error"] = str(error)[:200]
    await redis_client.hset("sources:status", source, json.dumps(data))
