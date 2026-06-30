import httpx
from fastapi import HTTPException
from config import settings

# DSI record column -> environment output key.
# CONFIRM the four GUESS fields against a real Postman GET on u_cmdb_ci_dsi.
DSI_FIELD_MAP = {
    "environmentId": "u_environment_id",  # GUESS - the "I-XXXXXX" identifier
    "environment": "name",                # GUESS - display name
    "tier": "u_environment",              # GUESS - DEV | PROD
    "hostRegion": "u_host_region",        # GUESS
    # status, sys_id, migration flag handled explicitly below (confirmed)
}


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
    env = {key: row.get(col, "") for key, col in DSI_FIELD_MAP.items()}
    env["status"] = "active"  # query already filters u_status_2=Active
    env["sysId"] = row.get("sys_id", "")        # becomes u_dsi on case POST
    env["isMigrationTarget"] = row.get("u_migration_mce") in (True, "true", "1")
    return env


async def list_companies() -> list[dict]:
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
            {"cid": r.get("number"), "name": r.get("name")}
            for r in resp.json().get("result", [])
        ]


async def get_company(cid: str) -> dict:
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
                "sysparm_limit": "50",
            },
        )
        if dsi_resp.status_code != 200:
            raise HTTPException(dsi_resp.status_code, "ServiceNow environment lookup failed")
        environments = [_dsi_to_environment(r) for r in dsi_resp.json().get("result", [])]

        return {
            "cid": account.get("number"),
            "name": account.get("name"),
            "accountSysId": account.get("sys_id"),
            "environments": environments,
        }


async def create_case(payload: dict) -> dict:
    async with _client() as client:
        resp = await client.post("/api/now/table/sn_customerservice_case", json=payload)
        if resp.status_code not in (200, 201):
            raise HTTPException(resp.status_code, "ServiceNow case creation failed")
        result = resp.json().get("result", {})
        return {"sysId": result.get("sys_id"), "number": result.get("number")}