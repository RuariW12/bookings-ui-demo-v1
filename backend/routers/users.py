from fastapi import APIRouter, HTTPException
from database import get_pool
from models import UserCreate, UserUpdate, UserOut

router = APIRouter(prefix="/api/users", tags=["users"])

MANAGER_ROLES = ("admin",)  # roles allowed to create/modify users


def row_to_user(row) -> dict:
    return {**dict(row), "regions": list(row["regions"] or [])}


async def _load_actor(pool, actor_email: str):
    """Resolve the acting user from the DB and confirm they may manage users."""
    if not actor_email:
        raise HTTPException(400, "actor_email is required")
    actor = await pool.fetchrow(
        "SELECT * FROM users WHERE email = $1 AND active = true", actor_email.lower()
    )
    if not actor or actor["role"] not in MANAGER_ROLES:
        raise HTTPException(403, "Only an active admin can manage users")
    return actor


def _within_actor_regions(actor, target_regions):
    """A manager may only assign regions they themselves cover."""
    actor_regions = set(actor["regions"] or [])
    if "*" in actor_regions:
        return
    outside = [r for r in target_regions if r not in actor_regions]
    if outside:
        raise HTTPException(403, f"Outside your region scope: {', '.join(outside)}")


@router.get("", response_model=list[UserOut])
async def list_users():
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM users ORDER BY created_at")
    return [row_to_user(r) for r in rows]


@router.post("", response_model=UserOut, status_code=201)
async def create_user(user: UserCreate, actor_email: str):
    pool = await get_pool()
    actor = await _load_actor(pool, actor_email)

    if user.role not in ("requester", "approver", "admin"):
        raise HTTPException(400, "Invalid role")
    if user.role in ("approver", "admin") and not user.regions:
        raise HTTPException(400, "This role must have at least one region")

    target_regions = [] if user.role == "requester" else user.regions
    _within_actor_regions(actor, target_regions)

    try:
        row = await pool.fetchrow(
            """INSERT INTO users (email, display_name, role, regions)
               VALUES ($1, $2, $3, $4) RETURNING *""",
            user.email.lower(), user.display_name, user.role, target_regions,
        )
    except Exception:
        raise HTTPException(409, "User with this email already exists")
    return row_to_user(row)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(user_id: int, update: UserUpdate, actor_email: str):
    pool = await get_pool()
    actor = await _load_actor(pool, actor_email)

    existing = await pool.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not existing:
        raise HTTPException(404, "User not found")
    if existing["seeded"]:
        raise HTTPException(403, "Seeded accounts cannot be modified")

    new_role = update.role if update.role is not None else existing["role"]
    new_regions = update.regions if update.regions is not None else list(existing["regions"] or [])
    new_active = update.active if update.active is not None else existing["active"]

    if new_role not in ("requester", "approver", "admin"):
        raise HTTPException(400, "Invalid role")
    if new_role == "requester":
        new_regions = []
    elif not new_regions:
        raise HTTPException(400, "This role must have at least one region")

    _within_actor_regions(actor, list(existing["regions"] or []))
    _within_actor_regions(actor, new_regions)

    losing_admin = existing["role"] == "admin" and (new_role != "admin" or not new_active)
    if losing_admin:
        others = await pool.fetchval(
            "SELECT count(*) FROM users WHERE role = 'admin' AND active = true AND id != $1",
            user_id,
        )
        if others < 1:
            raise HTTPException(400, "Cannot remove the last active admin")

    row = await pool.fetchrow(
        """UPDATE users SET
               display_name = COALESCE($2, display_name),
               role = $3, regions = $4, active = $5, updated_at = now()
           WHERE id = $1 RETURNING *""",
        user_id, update.display_name, new_role, new_regions, new_active,
    )
    return row_to_user(row)