from fastapi import APIRouter, HTTPException
from database import get_pool
from models import BlockCreate, BlockOut

router = APIRouter(prefix="/api/blocks", tags=["blocks"])


def row_to_block(row) -> dict:
    return {**dict(row), "regions": list(row["regions"] or [])}


async def _require_admin(pool, actor_email: str):
    if not actor_email:
        raise HTTPException(400, "actor_email is required")
    actor = await pool.fetchrow(
        "SELECT * FROM users WHERE email = $1 AND active = true", actor_email.lower()
    )
    if not actor or actor["role"] != "admin":
        raise HTTPException(403, "Only an active admin can manage blocks")
    return actor


@router.get("", response_model=list[BlockOut])
async def list_blocks():
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM schedule_blocks ORDER BY block_date, block_time NULLS FIRST"
    )
    return [row_to_block(r) for r in rows]


@router.post("", response_model=BlockOut, status_code=201)
async def create_block(block: BlockCreate, actor_email: str):
    pool = await get_pool()
    await _require_admin(pool, actor_email)
    if not block.regions:
        raise HTTPException(400, "At least one region is required")
    # Normalize: a single-day block stores end_date = block_date.
    end_date = block.end_date or block.block_date
    if end_date < block.block_date:
        raise HTTPException(400, "End date cannot be before the start date")
    row = await pool.fetchrow(
        """INSERT INTO schedule_blocks
               (block_date, end_date, block_time, title, regions, reason, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
        block.block_date, end_date, block.block_time, block.title,
        block.regions, block.reason, actor_email.lower(),
    )
    return row_to_block(row)


@router.delete("/{block_id}", status_code=204)
async def delete_block(block_id: int, actor_email: str):
    pool = await get_pool()
    await _require_admin(pool, actor_email)
    result = await pool.execute("DELETE FROM schedule_blocks WHERE id = $1", block_id)
    if result == "DELETE 0":
        raise HTTPException(404, "Block not found")