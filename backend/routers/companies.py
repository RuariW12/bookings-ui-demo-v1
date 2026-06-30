from fastapi import APIRouter
from snow import list_companies, get_company

router = APIRouter(prefix="/api/companies", tags=["servicenow"])


@router.get("")
async def companies():
    return await list_companies()


@router.get("/{cid}")
async def company(cid: str):
    return await get_company(cid)