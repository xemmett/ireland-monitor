import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sse_starlette.sse import EventSourceResponse

from brief import get_brief
from db import close_pool, get_geojson, get_incidents, get_recent_incidents

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None

# All connected SSE clients share one Redis subscriber via queues
_sse_clients: set[asyncio.Queue] = set()
_listener_task: asyncio.Task | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            os.environ.get("REDIS_URL", "redis://redis:6379/0"),
            decode_responses=True,
        )
    return _redis


_CHANNEL_EVENTS = {
    "incidents:new": "incident",
    "brief:updated": "brief",
}

# TrafficWatchNI CCTV stills require a same-site Referer or they 403 — proxy
# them through our own origin so the dashboard can <img> them directly.
WEBCAM_SOURCES = {
    "belfast-clifton": "https://cctv.trafficwatchni.com/8.jpg",
    "belfast-lagan": "https://cctv.trafficwatchni.com/9.jpg",
    "derry-james": "https://cctv.trafficwatchni.com/3292.jpg",
}


async def _redis_fanout():
    """Single Redis pub/sub listener that fans out to all SSE clients.

    Uses get_message(timeout=...) in a loop rather than listen(): redis-py's
    RESP3 connections impose an implicit ~5s read timeout, which listen()
    surfaces as a fatal redis.exceptions.TimeoutError on every idle period
    (incidents/briefs are only published once per scrape cycle, ~12 minutes
    apart) — killing this task moments after startup with no recovery.
    get_message(timeout=...) treats the same idle timeout as a normal "no
    message yet" None return, so the subscription survives quiet periods
    without reconnecting (which would otherwise create a message-loss
    window). The outer loop still reconnects on genuine Redis errors.
    """
    redis_client = get_redis()
    while True:
        try:
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(*_CHANNEL_EVENTS.keys())
            try:
                while True:
                    message = await pubsub.get_message(timeout=5.0)
                    if message is None or message["type"] != "message":
                        continue
                    event_name = _CHANNEL_EVENTS.get(message["channel"], "incident")
                    data = message["data"]
                    for q in list(_sse_clients):
                        try:
                            q.put_nowait((event_name, data))
                        except asyncio.QueueFull:
                            pass
            finally:
                await pubsub.aclose()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Redis fanout listener error, reconnecting: %s", e)
            await asyncio.sleep(2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _listener_task
    _listener_task = asyncio.create_task(_redis_fanout())
    yield
    if _listener_task:
        _listener_task.cancel()
    await close_pool()
    r = get_redis()
    await r.aclose()


app = FastAPI(title="Ireland Unrest Monitor API", lifespan=lifespan)

web_origin = os.environ.get("WEB_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[web_origin] if web_origin != "*" else ["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _cached(response: Response, seconds: int):
    response.headers["Cache-Control"] = f"public, max-age={seconds}, stale-while-revalidate={seconds * 2}"


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/incidents")
async def incidents(
    response: Response,
    since: str | None = Query(None),
    severity_min: str | None = Query(None),
    bbox: str | None = Query(None),
    country: str | None = Query(None),
    limit: int = Query(500, le=2000),
):
    rows = await get_incidents(since=since, severity_min=severity_min, bbox=bbox, country=country, limit=limit)
    _cached(response, 30)
    return rows


@app.get("/api/incidents/geojson")
async def incidents_geojson(response: Response, since: str | None = Query(None), country: str | None = Query(None)):
    _cached(response, 30)
    return await get_geojson(since=since, country=country)


@app.get("/api/brief")
async def brief(response: Response, region: str = Query("all")):
    redis_client = get_redis()
    result = await get_brief(redis_client, region=region)
    _cached(response, 120)
    return result


@app.get("/api/stream")
async def stream(request: Request):
    """SSE endpoint — one Redis listener fans out to all clients."""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _sse_clients.add(q)

    async def event_generator():
        try:
            yield {"event": "ping", "data": "connected"}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event_name, data = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield {"event": event_name, "data": data}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "heartbeat"}
        finally:
            _sse_clients.discard(q)

    return EventSourceResponse(event_generator())


@app.get("/api/webcam/{cam_id}")
async def webcam(cam_id: str):
    """Proxy a TrafficWatchNI CCTV still — the upstream 403s without a same-site Referer."""
    url = WEBCAM_SOURCES.get(cam_id)
    if not url:
        return Response(status_code=404)

    try:
        async with httpx.AsyncClient() as client:
            upstream = await client.get(
                url,
                headers={
                    "Referer": "https://www.trafficwatchni.com/",
                    "User-Agent": "Mozilla/5.0 (compatible; NIUnrestMonitor/1.0)",
                },
                timeout=10,
            )
        if upstream.status_code != 200:
            return Response(status_code=502)
        return Response(
            content=upstream.content,
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store"},
        )
    except httpx.HTTPError:
        return Response(status_code=502)


@app.get("/api/sources")
async def sources(response: Response):
    redis_client = get_redis()
    raw = await redis_client.hgetall("sources:status")
    result = {}
    for source, data in raw.items():
        try:
            result[source] = json.loads(data)
        except Exception:
            result[source] = {"status": "unknown"}
    _cached(response, 60)
    return result
