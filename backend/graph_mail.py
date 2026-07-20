import time
import httpx
from config import settings

_GRAPH = "https://graph.microsoft.com/v1.0"

# Simple in-process token cache. App-only tokens last ~1h; refetch a minute early.
_token_cache = {"value": None, "exp": 0.0}


def graph_configured() -> bool:
    """True only when every value needed to send is present."""
    return bool(
        settings.graph_tenant_id
        and settings.graph_client_id
        and settings.graph_client_secret
        and settings.graph_sender
    )


async def _get_token() -> str:
    now = time.time()
    if _token_cache["value"] and _token_cache["exp"] - 60 > now:
        return _token_cache["value"]

    url = f"https://login.microsoftonline.com/{settings.graph_tenant_id}/oauth2/v2.0/token"
    data = {
        "client_id": settings.graph_client_id,
        "client_secret": settings.graph_client_secret,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(url, data=data)
        res.raise_for_status()
        body = res.json()

    _token_cache["value"] = body["access_token"]
    _token_cache["exp"] = now + int(body.get("expires_in", 3600))
    return _token_cache["value"]


async def send_mail(to_recipients: list[str], subject: str, html_body: str) -> None:
    """Send one HTML email from settings.graph_sender. Raises on transport error;
    callers that must not fail the request should wrap this."""
    token = await _get_token()
    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": html_body},
            "toRecipients": [{"emailAddress": {"address": a}} for a in to_recipients],
        },
        "saveToSentItems": False,
    }
    url = f"{_GRAPH}/users/{settings.graph_sender}/sendMail"
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        res.raise_for_status()  # sendMail returns 202 Accepted on success