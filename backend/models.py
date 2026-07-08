from pydantic import BaseModel
from datetime import datetime
class UserCreate(BaseModel):
    email: str
    display_name: str
    role: str  # requester | approver | admin
    regions: list[str] = []
class UserUpdate(BaseModel):
    display_name: str | None = None
    role: str | None = None
    regions: list[str] | None = None
    active: bool | None = None
class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    role: str
    regions: list[str]
    active: bool
    seeded: bool
    created_at: datetime
    updated_at: datetime
class BookingCreate(BaseModel):
    operation_type: str  # environment_build | md_refresh | cutover
    region: str  # CLD-HQ | CLD-CTC | CLD-EMEA
    scheduled_date: str
    scheduled_time: str
    company_name: str | None = None
    company_id: str | None = None
    environment_id: str | None = None
    environment_name: str | None = None
    host_region: str | None = None
    notes: str | None = None
    requester_email: str | None = None
    requester_name: str | None = None
class BookingUpdate(BaseModel):
    # General edit for the schedule view. Approval is NOT handled here — it stays
    # on the region-guarded approve endpoint. Status here covers cancel/restore.
    region: str | None = None
    scheduled_date: str | None = None
    scheduled_time: str | None = None
    company_name: str | None = None
    company_id: str | None = None
    environment_id: str | None = None
    environment_name: str | None = None
    host_region: str | None = None
    notes: str | None = None
    status: str | None = None  # pending | cancelled
class BookingOut(BaseModel):
    id: int
    operation_type: str | None = None
    region: str | None = None
    scheduled_date: str
    scheduled_time: str
    company_name: str | None
    company_id: str | None
    environment_id: str | None
    environment_name: str | None
    host_region: str | None
    notes: str | None
    requester_email: str | None
    requester_name: str | None
    status: str
    approved_by: str | None
    approved_at: datetime | None
    servicenow_case_id: str | None
    created_at: datetime
    updated_at: datetime
class CompanySearch(BaseModel):
    query: str
class CaseCreate(BaseModel):
    short_description: str
    description: str | None = None
    account: str            # customer_account.sys_id
    u_dsi: str              # u_cmdb_ci_dsi.sys_id
    u_environment: str      # "DEV" | "PROD"
    u_product_version: str
    u_severity: str         # e.g. "Sev 3"
    priority: str           # e.g. "3"
class BlockCreate(BaseModel):
    block_date: str
    block_time: str | None = None   # None = whole day
    regions: list[str] = []
    reason: str | None = None


class BlockOut(BaseModel):
    id: int
    block_date: str
    block_time: str | None
    regions: list[str]
    reason: str | None
    created_by: str | None
    created_at: datetime