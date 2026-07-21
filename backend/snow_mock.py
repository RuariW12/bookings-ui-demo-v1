# snow_mock.py — fixture-backed ServiceNow for the localhost demo branch.
# Return shapes MUST match snow.py exactly (list_companies / get_company / create_case).
# Delete this file and its guards in snow.py before merging to main.
import uuid
from fastapi import HTTPException

# Full company records. list_companies() strips these down; get_company() returns
# the matching record whole. Environments mirror _dsi_to_environment() output.
_COMPANIES = [
    {
        "cid": "ACCT0012045",
        "name": "Contoso Ltd",
        "sys_id": "a1b2c3d4e5f60718293a4b5c6d7e8f90",
        "environments": [
            {
                "sys_id": "11f0a2b3c4d5e6f7a8b9c0d1e2f30411",
                "dsiNumber": "I-134845",
                "displayName": "I-134845 - Contoso PROD",
                "platform": "MCE",
                "version": "2021",
                "cluster": "cloudenv-3",
                "status": "Active",
                "migrationTarget": True,
            },
            {
                "sys_id": "22a1b2c3d4e5f6071829a3b4c5d6e7f8",
                "dsiNumber": "I-134846",
                "displayName": "I-134846 - Contoso DEV",
                "platform": "MCE",
                "version": "2021",
                "cluster": "cloudenv-3",
                "status": "Active",
                "migrationTarget": False,
            },
        ],
    },
    {
        "cid": "ACCT0033198",
        "name": "Northwind Traders",
        "sys_id": "b2c3d4e5f60718293a4b5c6d7e8f9012",
        "environments": [
            {
                "sys_id": "33b2c3d4e5f6071829a3b4c5d6e7f809",
                "dsiNumber": "I-141002",
                "displayName": "I-141002 - Northwind PROD",
                "platform": "MEP",
                "version": "2022",
                "cluster": "",
                "status": "Active",
                "migrationTarget": True,
            },
        ],
    },
    {
        "cid": "ACCT0048876",
        "name": "Fabrikam Inc",
        "sys_id": "c3d4e5f60718293a4b5c6d7e8f901234",
        "environments": [
            {
                "sys_id": "44c3d4e5f6071829a3b4c5d6e7f80a1b",
                "dsiNumber": "I-150310",
                "displayName": "I-150310 - Fabrikam PROD",
                "platform": "MCE",
                "version": "MicroStrategy ONE",
                "cluster": "cloudenv-7",
                "status": "Active",
                "migrationTarget": True,
            },
            {
                "sys_id": "55d4e5f60718293a4b5c6d7e8f901c2d",
                "dsiNumber": "I-150311",
                "displayName": "I-150311 - Fabrikam UAT",
                "platform": "MCE",
                "version": "MicroStrategy ONE",
                "cluster": "cloudenv-7",
                "status": "Active",
                "migrationTarget": False,
            },
            {
                "sys_id": "66e5f60718293a4b5c6d7e8f9012d3e4",
                "dsiNumber": "I-150312",
                "displayName": "I-150312 - Fabrikam DEV",
                "platform": "MEP",
                "version": "2021",
                "cluster": "",
                "status": "Active",
                "migrationTarget": False,
            },
        ],
    },
    {
        "cid": "ACCT0055214",
        "name": "Adventure Works",
        "sys_id": "d4e5f60718293a4b5c6d7e8f90123456",
        "environments": [
            {
                "sys_id": "77f60718293a4b5c6d7e8f9012d3e4f5",
                "dsiNumber": "I-160777",
                "displayName": "I-160777 - Adventure Works PROD",
                "platform": "MCE",
                "version": "2022",
                "cluster": "cloudenv-1",
                "status": "Active",
                "migrationTarget": True,
            },
        ],
    },
    {
        "cid": "ACCT0061903",
        "name": "Tailspin Toys",
        "sys_id": "e5f60718293a4b5c6d7e8f9012345678",
        "environments": [
            {
                "sys_id": "8807182993a4b5c6d7e8f9012d3e4f5a",
                "dsiNumber": "I-171450",
                "displayName": "I-171450 - Tailspin PROD",
                "platform": "MEP",
                "version": "2021",
                "cluster": "",
                "status": "Active",
                "migrationTarget": True,
            },
            {
                "sys_id": "9918293a4b5c6d7e8f9012d3e4f5a6b7",
                "dsiNumber": "I-171451",
                "displayName": "I-171451 - Tailspin DEV",
                "platform": "MEP",
                "version": "2021",
                "cluster": "",
                "status": "Active",
                "migrationTarget": False,
            },
        ],
    },
]

_case_seq = 12045  # in-memory counter; unique demo case numbers per server run


async def list_companies() -> list[dict]:
    return [
        {"cid": c["cid"], "name": c["name"], "sys_id": c["sys_id"]}
        for c in _COMPANIES
    ]


async def get_company(cid: str) -> dict:
    for c in _COMPANIES:
        if c["cid"] == cid:
            return {
                "cid": c["cid"],
                "name": c["name"],
                "sys_id": c["sys_id"],
                "environments": [dict(e) for e in c["environments"]],
            }
    raise HTTPException(404, "Company not found")


async def create_case(payload: dict) -> dict:
    global _case_seq
    _case_seq += 1
    return {
        "sysId": uuid.uuid4().hex,
        "number": f"CS{_case_seq:07d}",
    }