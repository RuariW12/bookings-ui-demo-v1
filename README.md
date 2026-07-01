# Parallel Build Scheduling Tool

A web app for scheduling Parallel Build (container migration) work — environment
builds, MD refreshes, and cutovers — for the CSM and CLS teams across three
operating regions (CLD-HQ, CLD-CTC, CLD-EMEA).

## What it does

- **Book** — pick an operation type, operating region, environment, and date/time.
  Validates lead time and slot availability before submitting.
- **Schedule** — a Float-style timeline of all bookings by region, with per-region
  build capacity and an inline edit/cancel modal.
- **Approvals** — managers review and approve/reject requests in-app, scoped to
  their region. Replaces the old Power Automate approval chain.
- **Admin** — manage users and roles (requester / approver / admin). Admins are
  region-scoped and can promote others within their own regions.

Login is via Entra ID (Microsoft SSO); the signed-in identity autofills the
requester fields and drives role-based access.

## What it replaces

**Old workflow:** CSMs coordinate times with CLS over Microsoft Teams, book into
Float, and wait on a CLS manager's approval through a separate flow.

**New workflow:** a CSM books through the scheduling UI, the approval happens in
the same app, and the Schedule tab replaces the Float calendar.

## Stack

- Frontend: React + Vite
- Backend: FastAPI + Postgres
- Reverse proxy / HTTPS: Caddy
- Deployment: Docker Compose on a single EC2 instance (Terraform in `infra/`)
- Auth: Entra ID (MSAL)

## Running locally

The full stack runs in Docker. From the repo root:

```bash
docker compose up --build
```

This starts the frontend, backend, and Postgres. Requires a `.env` at the repo
root (see `.env` keys referenced in `docker-compose.yml`).

To run the frontend alone against a local backend during development:

```bash
cd bookings-ui
npm install
npm run dev
```

## Status

Application complete and containerized. Remaining work is deployment (AWS) and
the ServiceNow integration (company lookup and case creation), both pending
external access.