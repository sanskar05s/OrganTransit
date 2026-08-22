from fastapi import Header, HTTPException, status

from supabase_client import supabase


async def get_current_user(authorization: str = Header(...)) -> dict:
    """
    Verifies the Supabase JWT the frontend sends (as `Authorization:
    Bearer <token>`) and returns {"id": ..., "role": ...} for the
    calling user. Raises 401 if the token is missing or invalid.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()

    try:
        user_resp = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired token")

    user = getattr(user_resp, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired token")

    profile = supabase.table("profiles").select("role").eq("id", user.id).execute()
    role = profile.data[0]["role"] if profile.data else "patient_family"

    return {"id": user.id, "role": role}


def require_doctor_for_transport(transport_id: str, user: dict) -> None:
    """
    Confirms `user` is the doctor who owns `transport_id`. Call this
    explicitly in any route that lets a doctor control a transport —
    the service-role client does NOT enforce this for you the way
    RLS would for a normal user-scoped client.
    """
    row = supabase.table("transports").select("doctor_id").eq("id", transport_id).execute()
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transport not found")
    if row.data[0]["doctor_id"] != user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not your transport")
