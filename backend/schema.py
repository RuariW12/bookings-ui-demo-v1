SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'requester',
    regions TEXT[] NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT true,
    seeded BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    operation_type TEXT NOT NULL,
    region TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    company_name TEXT,
    company_id TEXT,
    cid TEXT,
    environment_id TEXT,
    environment_name TEXT,
    host_region TEXT,
    notes TEXT,
    requester_email TEXT,
    requester_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    servicenow_case_id TEXT,
    assignees JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS schedule_blocks (
    id SERIAL PRIMARY KEY,
    block_date TEXT NOT NULL,              -- range start
    end_date TEXT,                         -- NULL = single day
    block_time TEXT,                       -- NULL = whole day
    title TEXT,
    regions TEXT[] NOT NULL DEFAULT '{}',
    reason TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

# Idempotent ALTERs for databases created before a column existed.
MIGRATIONS = """
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assignees JSONB NOT NULL DEFAULT '[]';
ALTER TABLE schedule_blocks ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE schedule_blocks ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cid TEXT;
"""


async def init_schema(pool):
    async with pool.acquire() as conn:
        await conn.execute(SCHEMA)
        await conn.execute(MIGRATIONS)