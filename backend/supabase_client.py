from supabase import create_client, Client

from config import settings

# Service-role client: bypasses RLS entirely. Every authorization
# check that RLS would normally do for a logged-in user, THIS
# client skips — so every route that uses it must check permissions
# itself in Python before touching the database. See deps.py.
supabase: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)
