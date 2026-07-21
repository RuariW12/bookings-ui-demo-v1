from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://bookings:bookings@localhost:5432/bookings"
    snow_instance: str = ""
    snow_username: str = ""
    snow_password: str = ""

    # Demo branch only: serve ServiceNow autofill + case creation from fixtures.
    # Set BOOKINGS_SNOW_MOCK=true in the demo .env. Never enable in prod.
    snow_mock: bool = False

    # Microsoft Graph (app-only / client credentials) for approver notifications.
    # Leave any blank to disable sending; notify() then no-ops and logs.
    graph_tenant_id: str = ""
    graph_client_id: str = ""
    graph_client_secret: str = ""
    graph_sender: str = ""  # mailbox to send AS (UPN, e.g. you@strategy.com)

    # Link placed in the approval email. Placeholder until a real host exists.
    app_approvals_url: str = "https://buildscheduler.example.com/approvals"

    class Config:
        env_prefix = "BOOKINGS_"

class Config:
        env_prefix = "BOOKINGS_"
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()