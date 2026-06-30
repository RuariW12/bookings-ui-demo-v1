from contextlib import asynccontextmanager
from fastapi import FastAPI
from database import get_pool, close_pool
from schema import init_schema
from routers import users
from routers import users, bookings
from routers import users, bookings, companies


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await get_pool()
    await init_schema(pool)
    yield
    await close_pool()


app = FastAPI(title="Bookings API", lifespan=lifespan)
app.include_router(users.router)
app.include_router(bookings.router)
app.include_router(companies.router)


@app.get("/api/health")
async def health():
    pool = await get_pool()
    tables = await pool.fetch(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    )
    return {"status": "ok", "tables": [t["tablename"] for t in tables]}