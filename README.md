# bookings-ui - Parallel Build Booking Tool

Internal booking tool for Strategy Cloud Support and Customer Success. Schedules container-migration work (Environment Builds, MD Refreshes, Cutovers) across three regions: **CLD-HQ**, **CLD-CTC**, **CLD-EMEA**.

## Why it exists

Booking migration work used to mean juggling Teams, Float, and Power Automate approvals across several people. This tool replaces that process all in one place:

- **One place to book** — pick a build type, date, and region; no chasing hand-offs.
- **Built-in approvals** — region-scoped approvers approve/reject in-app.
- **No double-booking** — the backend blocks conflicting slots at booking time.
- **ServiceNow linked** — approving a booking creates the SNOW case automatically.
- **Assignment + visibility** — approved bookings get assignees; the schedule shows status at a glance.

## Stack

React + Vite (frontend) · FastAPI + Postgres (backend) · Caddy (proxy/HTTPS) · Docker Compose · Terraform → EC2 · Entra/MSAL auth · ServiceNow integration.

## Structure

```
interface-v1/
├── bookings-ui/    # React frontend
├── backend/        # FastAPI + Postgres
└── infra/          # Terraform
```

## Status

Feature-complete. Deployed and proven on a test account (running, all containers healthy).

Remaining before prod: real domain (for HTTPS + MSAL), verify ServiceNow allows calls from EC2, and add DB backups.