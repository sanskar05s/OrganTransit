import asyncio
from datetime import datetime, timezone

from supabase_client import supabase
from blynk import blynk_get_all

MODE_THRESHOLDS = {
    "cold": (2.0, 8.0),
    "perfusion": (20.0, 37.0),
    "demo": (25.0, 30.0),
}
ACCEL_MAX = 1.5
TILT_MAX = 45.0
LDR_OPEN = 2000

DEFAULT_PINS = {
    "temp": "V0", "hum": "V1",
    "ax": "V2", "ay": "V3", "az": "V4",
    "lat": "V5", "lng": "V6", "ldr": "V7", "tilt": "V10",
}

READING_KEYS = ("temp", "hum", "ax", "ay", "az", "tilt", "lat", "lng", "ldr")


async def poll_once():
    transports = (
        supabase.table("transports")
        .select("id, temp_mode")
        .eq("status", "active")
        .eq("system_active", True)
        .execute()
    )

    for t in transports.data:
        transport_id = t["id"]

        try:
            secrets = (
                supabase.table("transport_secrets")
                .select("blynk_auth_token, blynk_pin_map")
                .eq("transport_id", transport_id)
                .execute()
            )
        except Exception as e:
            print(f"[poller] secrets lookup failed for {transport_id}: {e}")
            continue

        if not secrets.data or not secrets.data[0].get("blynk_auth_token"):
            continue  # doctor hasn't set a Blynk token for this transport yet

        token = secrets.data[0]["blynk_auth_token"]
        pins = secrets.data[0].get("blynk_pin_map") or DEFAULT_PINS
        values = await blynk_get_all(token, pins)

        box_status = None
        if values.get("ldr") is not None:
            box_status = "OPEN" if values["ldr"] < LDR_OPEN else "CLOSED"

        supabase.table("sensor_readings").insert(
            {
                "transport_id": transport_id,
                **{k: values.get(k) for k in READING_KEYS},
                "box_status": box_status,
            }
        ).execute()

        await evaluate_alerts(transport_id, t["temp_mode"], values)


async def evaluate_alerts(transport_id: str, temp_mode: str, values: dict):
    low, high = MODE_THRESHOLDS.get(temp_mode, MODE_THRESHOLDS["cold"])
    checks = []

    temp = values.get("temp")
    if temp is not None and not (low <= temp <= high):
        checks.append(("temperature", f"Temperature {temp}\u00b0C out of safe range ({low}-{high}\u00b0C)"))

    ax, ay, az = values.get("ax") or 0, values.get("ay") or 0, values.get("az") or 0
    magnitude = (ax ** 2 + ay ** 2 + az ** 2) ** 0.5
    if magnitude > ACCEL_MAX:
        checks.append(("acceleration", f"High acceleration detected: {magnitude:.2f}g"))

    tilt = values.get("tilt")
    if tilt is not None and tilt > TILT_MAX:
        checks.append(("tiltAngle", f"Tilt angle exceeded safe limit: {tilt}\u00b0"))

    ldr = values.get("ldr")
    if ldr is not None and ldr < LDR_OPEN:
        checks.append(("boxStatus", "Box tampering detected \u2014 lid is OPEN"))

    active_types = {c[0] for c in checks}
    all_types = ("temperature", "acceleration", "tiltAngle", "boxStatus")

    # open a new alert only for conditions that don't already have one unresolved
    for alert_type, message in checks:
        existing = (
            supabase.table("alerts")
            .select("id")
            .eq("transport_id", transport_id)
            .eq("type", alert_type)
            .eq("resolved", False)
            .execute()
        )
        if not existing.data:
            supabase.table("alerts").insert(
                {"transport_id": transport_id, "type": alert_type, "message": message}
            ).execute()

    # resolve anything that's no longer triggering
    for alert_type in all_types:
        if alert_type not in active_types:
            supabase.table("alerts").update(
                {"resolved": True, "resolved_at": datetime.now(timezone.utc).isoformat()}
            ).eq("transport_id", transport_id).eq("type", alert_type).eq("resolved", False).execute()


async def poller_loop():
    while True:
        try:
            await poll_once()
        except Exception as e:
            print(f"[poller] error: {e}")
        await asyncio.sleep(3)
