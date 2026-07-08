from fastapi import APIRouter

router = APIRouter(prefix="/api/employees", tags=["employees"])

# MOCK global cloud-support roster. Replace with the ServiceNow list later —
# keep the {name, email, region} shape and only this file changes (server-side).
_MOCK = [
    {"name": "Ava Chen",        "email": "achen@strategy.com",     "region": "CLD-HQ"},
    {"name": "Marcus Reyes",    "email": "mreyes@strategy.com",    "region": "CLD-HQ"},
    {"name": "Priya Nair",      "email": "pnair@strategy.com",     "region": "CLD-HQ"},
    {"name": "Tom Halloran",    "email": "thalloran@strategy.com", "region": "CLD-HQ"},
    {"name": "Sofia Marchetti", "email": "smarchetti@strategy.com","region": "CLD-CTC"},
    {"name": "Diego Fuentes",   "email": "dfuentes@strategy.com",  "region": "CLD-CTC"},
    {"name": "Hana Kim",        "email": "hkim@strategy.com",      "region": "CLD-CTC"},
    {"name": "Liam O'Connor",   "email": "loconnor@strategy.com",  "region": "CLD-CTC"},
    {"name": "Elena Novak",     "email": "enovak@strategy.com",    "region": "CLD-EMEA"},
    {"name": "Raj Patel",       "email": "rpatel@strategy.com",    "region": "CLD-EMEA"},
    {"name": "Claire Dubois",   "email": "cdubois@strategy.com",   "region": "CLD-EMEA"},
    {"name": "Yusuf Demir",     "email": "ydemir@strategy.com",    "region": "CLD-EMEA"},
]


@router.get("")
async def list_employees(region: str | None = None):
    if region:
        return [e for e in _MOCK if e["region"] == region]
    return _MOCK