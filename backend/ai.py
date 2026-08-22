import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import google.generativeai as genai

from config import settings
from supabase_client import supabase
from deps import get_current_user

genai.configure(api_key=settings.gemini_api_key)
model = genai.GenerativeModel("gemini-2.5-flash")  # confirm this is still current in Google's docs

router = APIRouter(prefix="/transports/{transport_id}/ai", tags=["ai"])

# --- very basic per-user rate limit: 1 call / 5 seconds ---
# Fine for a single dev/demo process. For multiple workers or real
# traffic, swap this in-memory dict for slowapi + Redis.
_last_call: dict = {}


def check_rate_limit(user_id: str):
    now = time.time()
    if now - _last_call.get(user_id, 0) < 5:
        raise HTTPException(status_code=429, detail="slow down a little")
    _last_call[user_id] = now


def check_access(transport_id: str, user: dict):
    """Doctor who owns it, or a linked family viewer — anyone else gets 403."""
    t = supabase.table("transports").select("doctor_id").eq("id", transport_id).execute()
    if t.data and t.data[0]["doctor_id"] == user["id"]:
        return
    v = (
        supabase.table("transport_viewers")
        .select("profile_id")
        .eq("transport_id", transport_id)
        .eq("profile_id", user["id"])
        .execute()
    )
    if v.data:
        return
    raise HTTPException(status_code=403, detail="no access to this transport")


def build_sensor_context(transport_id: str) -> str:
    """Pulls the authoritative sensor snapshot from Supabase instead of
    trusting a string the client sends — closes the old Flask version's
    'AI prompt built from whatever the browser claims sensors say' gap."""
    reading = (
        supabase.table("sensor_readings")
        .select("*")
        .eq("transport_id", transport_id)
        .order("ts", desc=True)
        .limit(1)
        .execute()
    )
    if not reading.data:
        return "No sensor data yet for this transport."

    transport = supabase.table("transports").select("temp_mode").eq("id", transport_id).execute()
    alerts = (
        supabase.table("alerts")
        .select("type, message")
        .eq("transport_id", transport_id)
        .eq("resolved", False)
        .execute()
    )

    r = reading.data[0]
    mode = transport.data[0]["temp_mode"] if transport.data else "unknown"
    active_alerts = ", ".join(a["message"] for a in alerts.data) or "None"

    return (
        f"Temperature: {r['temp']}\u00b0C (Mode: {mode})\n"
        f"Humidity: {r['hum']}%\n"
        f"Acceleration: ax={r['ax']} ay={r['ay']} az={r['az']}g | Tilt: {r['tilt']}\u00b0\n"
        f"Box: {r['box_status']}\n"
        f"GPS: {r['lat']}, {r['lng']}\n"
        f"Active alerts: {active_alerts}"
    )


class ChatBody(BaseModel):
    message: str


@router.post("/chat")
async def chat(transport_id: str, body: ChatBody, user: dict = Depends(get_current_user)):
    check_access(transport_id, user)
    check_rate_limit(user["id"])

    sensors = build_sensor_context(transport_id)
    prompt = f"""You are a medical AI assistant monitoring organ transport.

Sensor Data:
{sensors}

Doctor Question:
{body.message}

Answer clinically and briefly.
"""
    response = model.generate_content(prompt)
    return {"status": "ok", "reply": response.text}


@router.post("/status")
async def status(transport_id: str, user: dict = Depends(get_current_user)):
    check_access(transport_id, user)
    check_rate_limit(user["id"])

    sensors = build_sensor_context(transport_id)
    prompt = f"""You are a medical AI monitoring organ transport.

Sensor Data:
{sensors}

Write one short clinical summary.
Then on a new line write ONLY: Safe, Caution, or Critical.
"""
    response = model.generate_content(prompt)
    return {"status": "ok", "reply": response.text}


class ExplainBody(BaseModel):
    alert: str


@router.post("/explain-alert")
async def explain_alert(transport_id: str, body: ExplainBody, user: dict = Depends(get_current_user)):
    check_access(transport_id, user)
    check_rate_limit(user["id"])

    sensors = build_sensor_context(transport_id)
    prompt = f"""You are a medical AI monitoring organ transport.

Alert:
{body.alert}

Sensor Data:
{sensors}

Explain briefly:
1. What this alert means medically.
2. What action the doctor should take immediately.
"""
    response = model.generate_content(prompt)
    return {"status": "ok", "reply": response.text}
