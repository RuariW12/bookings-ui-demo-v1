from fastapi import APIRouter, HTTPException
from database import get_pool
from models import UserCreate, UserUpdate, UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


def row_to_user(row) -> dict:
    return {**dict(row), "regions": list(row["regions"] or [])}


@router.get("", response_model=list[UserOut])
async def list_users():
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM users ORDER BY created_at")
    return [row_to_user(r) for r in rows]


@router.post("", response_model=UserOut, status_code=201)
async def create_user(user: UserCreate):
    if user.role == "admin":
        raise HTTPException(400, "Admin role cannot be granted via UI")
    if user.role == "approver" and not user.regions:
        raise HTTPException(400, "Approvers must have at least one region")

    pool = await get_pool()
    try:
        row = await pool.fetchrow(
            """INSERT INTO users (email, display_name, role, regions)
               VALUES ($1, $2, $3, $4) RETURNING *""",
            user.email, user.display_name, user.role, user.regions,
        )
    except Exception:
        raise HTTPException(409, "User with this email already exists")
    return row_to_user(row)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(user_id: int, update: UserUpdate):
    pool = await get_pool()
    existing = await pool.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not existing:
        raise HTTPException(404, "User not found")
    if existing["seeded"]:
        raise HTTPException(403, "Seeded accounts cannot be modified")

    new_role = update.role if update.role is not None else existing["role"]
    new_regions = update.regions if update.regions is not None else list(existing["regions"] or [])
    new_active = update.active if update.active is not None else existing["active"]

    if new_role == "admin" and existing["role"] != "admin":
        raise HTTPException(400, "Admin role cannot be granted via UI")
    if new_role == "approver" and not new_regions:
        raise HTTPException(400, "Approvers must have at least one region")

    if not new_active and existing["role"] == "admin":
        count = await pool.fetchval(
            "SELECT count(*) FROM users WHERE role = 'admin' AND active = true AND id != $1",
            user_id,
        )
        if count < 1:
            raise HTTPException(400, "Cannot deactivate the last active admin")

    row = await pool.fetchrow(
        """UPDATE users SET
               display_name = COALESCE($2, display_name),
               role = $3, regions = $4, active = $5, updated_at = now()
           WHERE id = $1 RETURNING *""",
        user_id, update.display_name, new_role, new_regions, new_active,
    )
    return row_to_user(row)