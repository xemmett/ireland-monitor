import asyncpg
import json
import os
from typing import Any

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            os.environ["DATABASE_URL"],
            min_size=2,
            max_size=10,
            command_timeout=30,
        )
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


SEVERITY_ORDER = ["calm", "watch", "elevated", "high", "critical"]


def _row_to_dict(row: asyncpg.Record) -> dict:
    d = dict(row)
    if "time" in d and d["time"]:
        d["time"] = d["time"].isoformat()
    if "first_seen" in d and d["first_seen"]:
        d["first_seen"] = d["first_seen"].isoformat()
    return d


async def get_incidents(
    since: str | None = None,
    severity_min: str | None = None,
    bbox: str | None = None,
    country: str | None = None,
    limit: int = 500,
) -> list[dict]:
    pool = await get_pool()
    conditions = ["1=1"]
    args: list[Any] = []
    n = 1

    if since:
        conditions.append(f"time >= ${n}::timestamptz")
        args.append(since)
        n += 1

    if severity_min and severity_min in SEVERITY_ORDER:
        idx = SEVERITY_ORDER.index(severity_min)
        placeholders = ", ".join(f"${n + i}" for i in range(len(SEVERITY_ORDER) - idx))
        conditions.append(f"severity IN ({placeholders})")
        args.extend(SEVERITY_ORDER[idx:])
        n += len(SEVERITY_ORDER) - idx

    if bbox:
        # bbox=minlng,minlat,maxlng,maxlat
        parts = [float(x) for x in bbox.split(",")]
        if len(parts) == 4:
            conditions.append(
                f"ST_Within(geom::geometry, ST_MakeEnvelope(${n}, ${n+1}, ${n+2}, ${n+3}, 4326))"
            )
            args.extend(parts)
            n += 4

    if country:
        conditions.append(f"country = ${n}")
        args.append(country)
        n += 1

    where = " AND ".join(conditions)
    query = f"""
        SELECT id, time, first_seen, title, summary, severity, source, source_type,
               url, location, confidence, cluster_id, country,
               ST_Y(geom::geometry) AS lat,
               ST_X(geom::geometry) AS lng
        FROM incidents
        WHERE {where}
        ORDER BY time DESC
        LIMIT ${n}
    """
    args.append(limit)

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *args)

    return [_row_to_dict(r) for r in rows]


async def get_geojson(since: str | None = None, country: str | None = None) -> dict:
    pool = await get_pool()
    conditions = ["1=1"]
    args: list[Any] = []
    n = 1

    if since:
        conditions.append(f"time >= ${n}::timestamptz")
        args.append(since)
        n += 1

    if country:
        conditions.append(f"country = ${n}")
        args.append(country)
        n += 1

    where = " AND ".join(conditions)
    query = f"""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', coalesce(json_agg(
                json_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geom)::json,
                    'properties', json_build_object(
                        'id', id,
                        'time', time,
                        'title', title,
                        'summary', summary,
                        'severity', severity,
                        'source', source,
                        'source_type', source_type,
                        'url', url,
                        'location', location,
                        'confidence', confidence,
                        'cluster_id', cluster_id,
                        'country', country
                    )
                )
            ), '[]'::json)
        ) AS geojson
        FROM incidents
        WHERE {where}
    """

    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *args)

    return row["geojson"] if row else {"type": "FeatureCollection", "features": []}


async def get_recent_incidents(hours: int = 24) -> list[dict]:
    pool = await get_pool()
    query = """
        SELECT id, time, first_seen, title, summary, severity, source, source_type,
               url, location, confidence, cluster_id, country,
               ST_Y(geom::geometry) AS lat,
               ST_X(geom::geometry) AS lng
        FROM incidents
        WHERE time >= now() - ($1 || ' hours')::interval
        ORDER BY time DESC
        LIMIT 200
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, str(hours))
    return [_row_to_dict(r) for r in rows]
