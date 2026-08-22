import asyncio

import httpx

BLYNK_BASE = "https://blynk.cloud/external/api"


async def blynk_get(token: str, pin: str) -> float | None:
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            r = await client.get(f"{BLYNK_BASE}/get", params={"token": token, "pin": pin})
            r.raise_for_status()
            return float(r.text)
        except Exception:
            return None


async def blynk_set(token: str, pin: str, value) -> bool:
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            r = await client.get(f"{BLYNK_BASE}/update", params={"token": token, "pin": pin, "value": value})
            r.raise_for_status()
            return True
        except Exception:
            return False


async def blynk_get_all(token: str, pins: dict) -> dict:
    """pins: {'temp': 'V0', 'hum': 'V1', ...} -> {'temp': 26.5, 'hum': 61.2, ...}
    Fetches all pins concurrently — same pattern as the Promise.all in
    the old app.js blynkGet() calls."""
    keys = list(pins.keys())
    values = await asyncio.gather(*(blynk_get(token, pins[k]) for k in keys))
    return dict(zip(keys, values))
