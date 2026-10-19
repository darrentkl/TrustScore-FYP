import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load values from .env
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError(
        "Missing SUPABASE_URL or SUPABASE_KEY. "
        "Create a .env file and fill in your credentials."
    )

if not SUPABASE_SERVICE_KEY:
    raise ValueError(
        "Missing SUPABASE_SERVICE_KEY. "
        "Add your service role (secret) key to the .env file."
    )

# Supabase client for authentication and normal requests
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Admin client for backend database operations
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)