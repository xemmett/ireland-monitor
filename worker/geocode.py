import asyncio
import json
import logging
import os
import re
import unicodedata
from pathlib import Path

import httpx
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_GAZETTEER: dict | None = None
_NOM_SEMAPHORE = asyncio.Semaphore(1)

NOM_UA = "ni-unrest-monitor/1.0 (OSINT civil-unrest tracking; github.com/ni-unrest-monitor)"


def _load_gazetteer() -> dict:
    global _GAZETTEER
    if _GAZETTEER is None:
        p = Path(__file__).parent / "gazetteer.json"
        with open(p) as f:
            _GAZETTEER = json.load(f)
    return _GAZETTEER


def _normalise(text: str) -> str:
    text = text.lower().strip()
    text = unicodedata.normalize("NFD", text)
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _gazetteer_lookup(location: str) -> tuple[float, float] | None:
    gz = _load_gazetteer()
    norm = _normalise(location)

    # Exact match
    if norm in gz:
        entry = gz[norm]
        return entry["lat"], entry["lng"]

    # Substring match: find if any gazetteer key is in the location string
    for key, entry in gz.items():
        if key in norm or norm in key:
            return entry["lat"], entry["lng"]

    return None


async def _nominatim_lookup(
    location: str, redis_client: aioredis.Redis
) -> tuple[float, float] | None:
    norm = _normalise(location)
    cache_key = f"geo:{norm}"

    cached = await redis_client.get(cache_key)
    if cached:
        data = json.loads(cached)
        return data["lat"], data["lng"]

    async with _NOM_SEMAPHORE:
        await asyncio.sleep(1.0)
        try:
            async with httpx.AsyncClient(
                headers={"User-Agent": NOM_UA}, timeout=10.0
            ) as client:
                resp = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": f"{location}, Ireland", "format": "json", "limit": 1},
                )
                resp.raise_for_status()
                results = resp.json()
                if results:
                    lat = float(results[0]["lat"])
                    lng = float(results[0]["lon"])
                    await redis_client.set(cache_key, json.dumps({"lat": lat, "lng": lng}))
                    return lat, lng
        except Exception as e:
            logger.warning("Nominatim lookup failed for %r: %s", location, e)

    return None


async def lookup(
    location: str, redis_client: aioredis.Redis
) -> tuple[float, float] | None:
    if not location:
        return None

    coords = _gazetteer_lookup(location)
    if coords:
        return coords

    return await _nominatim_lookup(location, redis_client)
