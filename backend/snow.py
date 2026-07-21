import httpx
from fastapi import HTTPException
from config import settings
import snow_mock

# Confirmed u_cmdb_ci_dsi columns (live-verified):
#   sys_id, name, u_platform, u_version, u_dsi_cloenv, u_status_2, u_migration_mce
# No tier column and no host-region column exist on this table.
# DSI number is parsed from `name` ("I-XXXXXX - ..."), not a dedicated field.

def _client() -> httpx.AsyncClient:
    if not settings.snow_instance:
        raise HTTPException(503, "ServiceNow not configured")
    return httpx.AsyncClient(
        base_url=f"https://{settings.snow_instance}.service-now.com",
        auth=(settings.snow_username, settings.snow_password),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=15.0,
    )

def _dsi_to_environment(row: dict) -> dict:
    name = row.get("name", "") or ""
    return {
        "sys_id": row.get("sys_id", ""),                 # -> case u_dsi
        "dsiNumber": name.split(" - ")[0].strip(),       # "I-134845"
        "displayName": name,
        "platform": row.get("u_platform", ""),           # MCE | MEP
        "version": row.get("u_version", ""),             # "2021", etc.
        "cluster": row.get("u_dsi_cloenv", ""),          # MCE-only, else ""
        "status": row.get("u_status_2", ""),             # "Active"
        "migrationTarget": row.get("u_migration_mce") in (True, "true", "1"),
    }

async def list_companies() -> list[dict]:
    if settings.snow_mock:
        return await snow_mock.list_companies()
    async with _client() as client:
        resp = await client.get(
            "/api/now/table/customer_account",
            params={
                "sysparm_query": "active=true",
                "sysparm_fields": "sys_id,name,number",
                "sysparm_limit": "100",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(resp.status_code, "ServiceNow company list failed")
        return [
            {"cid": r.get("number"), "name": r.get("name"), "sys_id": r.get("sys_id")}
            for r in resp.json().get("result", [])
        ]

async def get_company(cid: str) -> dict:
    if settings.snow_mock:
        return await snow_mock.get_company(cid)
    async with _client() as client:
        acct_resp = await client.get(
            "/api/now/table/customer_account",
            params={
                "sysparm_query": f"number={cid}",
                "sysparm_fields": "sys_id,name,number",
                "sysparm_limit": "1",
            },
        )
        if acct_resp.status_code != 200:
            raise HTTPException(acct_resp.status_code, "ServiceNow company lookup failed")
        accounts = acct_resp.json().get("result", [])
        if not accounts:
            raise HTTPException(404, "Company not found")
        account = accounts[0]

        dsi_resp = await client.get(
            "/api/now/table/u_cmdb_ci_dsi",
            params={
                "sysparm_query": f"u_account={account['sys_id']}^u_status_2=Active",
                "sysparm_fields": "sys_id,name,u_platform,u_version,u_dsi_cloenv,u_status_2,u_migration_mce",
                "sysparm_limit": "50",
            },
        )
        if dsi_resp.status_code != 200:
            raise HTTPException(dsi_resp.status_code, "ServiceNow environment lookup failed")
        environments = [_dsi_to_environment(r) for r in dsi_resp.json().get("result", [])]

        return {
            "cid": account.get("number"),
            "name": account.get("name"),
            "sys_id": account.get("sys_id"),
            "environments": environments,
        }

async def create_case(payload: dict) -> dict:
    if settings.snow_mock:
        return await snow_mock.create_case(payload)
    async with _client() as client:
        resp = await client.post("/api/now/table/sn_customerservice_case", json=payload)
        if resp.status_code not in (200, 201):
            raise HTTPException(resp.status_code, "ServiceNow case creation failed")
        result = resp.json().get("result", {})
        return {"sysId": result.get("sys_id"), "number": result.get("number")}