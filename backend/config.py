from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://bookings:bookings@localhost:5432/bookings"
    snow_instance: str = ""
    snow_username: str = ""
    snow_password: str = ""

    class Config:
        env_prefix = "BOOKINGS_"


settings = Settings()