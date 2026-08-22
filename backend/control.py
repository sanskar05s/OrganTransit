from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from supabase_client import supabase
from deps import get_current_user, require_doctor_for_transport
from blynk import blynk_set

router = APIRouter(prefix="/transports/{transport_id}", tags=["control"])

MODE_TO_BLYNK_VALUE = {"cold": 0, "perfusion": 1, "demo": 2}


def _get_secrets(transport_id: str):
    row = (
        supabase.table("transport_secrets")
        .select("blynk_auth_token, blynk_pin_map")
        .eq("transport_id", transport_id)
        .execute()
    )
    return row.data[0] if row.data else None


class ModeBody(BaseModel):
    mode: str  # 'cold' | 'perfusion' | 'demo'


@router.post("/mode")
async def set_mode(transport_id: str, body: ModeBody, user: dict = Depends(get_current_user)):
    require_doctor_for_transport(transport_id, user)
    if body.mode not in MODE_TO_BLYNK_VALUE:
        raise HTTPException(status_code=400, detail="invalid mode")

    supabase.table("transports").update({"temp_mode": body.mode}).eq("id", transport_id).execute()

    secrets = _get_secrets(transport_id)
    if secrets and secrets.get("blynk_auth_token"):
        pins = secrets.get("blynk_pin_map") or {}
        await blynk_set(secrets["blynk_auth_token"], pins.get("mode", "V9"), MODE_TO_BLYNK_VALUE[body.mode])

    return {"status": "ok", "temp_mode": body.mode}


class SystemBody(BaseModel):
    active: bool


@router.post("/system")
async def set_system(transport_id: str, body: SystemBody, user: dict = Depends(get_current_user)):
    require_doctor_for_transport(transport_id, user)

    supabase.table("transports").update({"system_active": body.active}).eq("id", transport_id).execute()

    secrets = _get_secrets(transport_id)
    if secrets and secrets.get("blynk_auth_token"):
        pins = secrets.get("blynk_pin_map") or {}
        await blynk_set(secrets["blynk_auth_token"], pins.get("ctrl", "V8"), 1 if body.active else 0)

    return {"status": "ok", "system_active": body.active}


class SecretsBody(BaseModel):
    blynk_auth_token: str
    blynk_pin_map: dict | None = None
    ors_api_key: str | None = None


@router.post("/secrets")
async def set_secrets(transport_id: str, body: SecretsBody, user: dict = Depends(get_current_user)):
    """Doctor sets the Blynk token here instead of the old Settings modal
    writing it to localStorage. It lands in transport_secrets, which no
    browser-facing client can ever read."""
    require_doctor_for_transport(transport_id, user)
    supabase.table("transport_secrets").upsert(
        {
            "transport_id": transport_id,
            "blynk_auth_token": body.blynk_auth_token,
            "blynk_pin_map": body.blynk_pin_map,
            "ors_api_key": body.ors_api_key,
        }
    ).execute()
    return {"status": "ok"}
