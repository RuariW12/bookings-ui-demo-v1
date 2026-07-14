# bookings-ui - Parallel Build Booking Tool

Internal booking tool for Strategy Cloud Support and Customer Success. Schedules container-migration work (Environment Builds, MD Refreshes, Cutovers) across three regions: **CLD-HQ**, **CLD-CTC**, **CLD-EMEA**.

## Why it exists

Booking migration work used to mean juggling Teams, Float, and Power Automate approvals across several people. This tool replaces that process all in one place:

- **One place to book.** Pick a build type, date, and region; no chasing hand-offs.
- **Reserve before you commit.** Hold candidate dates as soft holds while you're still agreeing a window with the customer. They block other CSMs, never go for approval, and expire after 7 days.
- **Built-in approvals.** Region-scoped approvers approve/reject in-app.
- **No double-booking.** The backend blocks conflicting slots at booking time.
- **ServiceNow linked.** Approving a booking creates the SNOW case automatically.
- **Assignment + visibility.** Approved bookings get assignees; the schedule shows status at a glance.

## Stack

React + Vite (frontend) · FastAPI + Postgres (backend) · Caddy (proxy/HTTPS) · Docker Compose · Terraform → EC2 · Entra/MSAL auth · ServiceNow integration.

## Structure

```
interface-v1/
├── bookings-ui/        # React frontend
├── backend/            # FastAPI + Postgres
├── infra/              # Terraform
├── docker-compose.yml  # full stack: web + backend + db
├── Dockerfile          # builds the SPA, serves it via Caddy
└── Caddyfile           # routes /api/* to the backend, everything else to the SPA
```

---

# Running it

Two ways. **Dev mode** for day-to-day work (hot reload). **Container mode** to run the real stack the way it runs on EC2.

## Prerequisites

- Docker Desktop
- Node 20+
- Python 3.12+

---

## Dev mode (hot reload)

Postgres runs in a container; the backend and frontend run natively so both reload on save.

### First-time setup

Create the Postgres container. The name, credentials, and database all have to match `backend/config.py`'s default connection string:

```powershell
docker run -d --name bookings-pg `
  -e POSTGRES_USER=bookings `
  -e POSTGRES_PASSWORD=bookings `
  -e POSTGRES_DB=bookings `
  -p 5432:5432 `
  postgres:16-alpine
```

Set up the backend virtualenv:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
```

Install frontend packages:

```powershell
cd bookings-ui
npm install
cd ..
```

Now seed a user, or you will not be able to log in. See [Seeding users](#seeding-users) below.

### Day to day

```powershell
.\start-dev.ps1    # starts Postgres, backend, frontend
.\stop-dev.ps1     # stops all three
```

`start-dev.ps1` opens two extra PowerShell windows (backend and frontend) and records their PIDs in `.dev-pids` so `stop-dev.ps1` can kill them.

**Open http://localhost:5173**

Vite proxies `/api/*` to the backend on `127.0.0.1:8000`, so the frontend calls relative paths and there is no CORS setup. The backend's interactive API docs are at http://localhost:8000/docs.

The schema is created on backend startup. `init_schema` runs `CREATE TABLE IF NOT EXISTS` plus idempotent `ALTER`s, so restarting the backend is how migrations get applied. Existing data survives.

---

## Container mode (the real stack)

Three containers: **web** (Caddy serving the built SPA, plus reverse proxy), **backend** (FastAPI/uvicorn), **db** (Postgres). Only `web` is exposed to the host. This is exactly what runs on EC2.

Create a `.env` in the repo root (see [Environment variables](#environment-variables)), then:

```powershell
docker compose up -d --build
```

**Open http://localhost**

```powershell
docker compose logs -f            # tail all logs
docker compose logs -f backend    # just the backend
docker compose ps                 # container health
docker compose down               # stop (data survives, it's in a volume)
docker compose down -v            # stop AND wipe the database
docker compose up -d --build web  # rebuild just the frontend after a code change
```

The frontend is compiled into the image at build time, so **any frontend change needs `--build`** to show up. Backend code is also baked in; rebuild it the same way.

---

## Environment variables

`.env` in the repo root, read by `docker compose`. Not needed for dev mode.

```dotenv
# Postgres (required)
POSTGRES_USER=bookings
POSTGRES_PASSWORD=change-me
POSTGRES_DB=bookings

# Caddy (required)
# http://localhost keeps Caddy on plain HTTP. It cannot get a Let's Encrypt cert
# for "localhost", and would fail on startup if you gave it a bare hostname.
DOMAIN=http://localhost
ACME_EMAIL=you@strategy.com

# Entra / MSAL. Not secrets, they ship in the browser bundle.
# UNSET is treated as "not configured" and falls back to the dev app registration.
VITE_ENTRA_CLIENT_ID=UNSET
VITE_ENTRA_TENANT_ID=UNSET
VITE_REDIRECT_URI=UNSET

# ServiceNow (optional). Unset means SNOW routes return 503 and the UI uses mocks.
BOOKINGS_SNOW_INSTANCE=
BOOKINGS_SNOW_USERNAME=
BOOKINGS_SNOW_PASSWORD=
```

In production these are written to `.env` at boot by the EC2 user-data script, pulled from SSM Parameter Store. Nothing secret is committed.

`VITE_*` values are passed as Docker build args and compiled into the bundle, so **changing them requires a rebuild** (`docker compose up -d --build web`), not just a restart.

---

## Seeding users

Roles live in Postgres and nowhere else. `GET /api/users/me` returns 403 for any email that is not an active row in `users`, which is also the login allowlist.

**A fresh database has no users, so nobody can log in, including you.** Seed at least one admin first.

`backend/seed_users.py` is the tool for this. It holds the real roster, so it is gitignored and **not in the repo**. On a fresh clone you need to bring your own copy, or insert a bootstrap admin by hand:

```powershell
# dev mode
docker exec -it bookings-pg psql -U bookings -d bookings

# container mode
docker compose exec db psql -U bookings -d bookings
```

```sql
INSERT INTO users (email, display_name, role, regions, active)
VALUES ('you@strategy.com', 'Your Name', 'admin', '{CLD-HQ,CLD-CTC,CLD-EMEA}', true);
```

Once one admin exists, everyone else can be added through the Admin tab in the UI.

With `seed_users.py` present, edit the `REQUESTERS` list and `APPROVERS` dict at the top and run it. It is idempotent, so re-run it whenever the roster changes:

```powershell
cd backend
python seed_users.py                     # dev mode
docker compose exec backend python seed_users.py   # container mode
```

It adds new people, reactivates returning ones, corrects roles and regions, and (with `DEACTIVATE_MISSING=True`) deactivates anyone dropped from the lists. It never deletes rows and never touches admins.

---

## Ports

| Port | What | Mode |
|------|------|------|
| 5173 | Vite dev server (the URL you open) | dev |
| 8000 | FastAPI, plus `/docs` | dev |
| 5432 | Postgres | dev |
| 80   | Caddy, serving the SPA and proxying `/api` (the URL you open) | container |
| 443  | Caddy HTTPS, only live with a real domain | container |

In container mode the backend and database have no host ports. They are reachable only from inside the Compose network, which is why Caddy proxies `/api` rather than the browser calling the backend directly.

---

## Troubleshooting

**Can't log in / "Your account is not authorized for this app"**
The email is not an active row in `users`. See [Seeding users](#seeding-users). This is the expected behavior of the allowlist, not a bug.

**`docker compose up` warns about unset variables**
`.env` is missing or incomplete. Every `${VAR}` in `docker-compose.yml` without a `:-` default has to be present.

**Port 80 already in use (container mode)**
Something else is bound to 80. Stop it, or change the `web` port mapping to something like `"8080:80"` and open http://localhost:8080.

**Frontend changes not showing (container mode)**
The SPA is compiled into the image. Run `docker compose up -d --build web`.

**`start-dev.ps1` fails on `docker start bookings-pg`**
The container doesn't exist yet. Run the `docker run` in first-time setup.

**Backend won't connect to Postgres (dev mode)**
`bookings-pg` must be running with user/password/database all set to `bookings`, on port 5432, to match the default in `backend/config.py`. Override with `BOOKINGS_DATABASE_URL` if yours differs.

**Microsoft sign-in fails**
Every origin you use has to be registered in the Entra app registration under **Authentication → Single-page application** (not "Web"). `http://localhost:5173` is allowed as an explicit exception to the HTTPS-only rule; `http://localhost` needs adding separately if you sign in from container mode.

---

## Status

Feature-complete. Deployed and proven on a test account (running, all containers healthy).

Remaining before prod: a real domain (needed for both HTTPS and the MSAL redirect URI), confirmation that ServiceNow's IP allowlist permits calls from EC2, and database backups.