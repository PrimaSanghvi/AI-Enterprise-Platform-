from backend.db import SCHEMA, query

DISPLAY_NAME = "Snowflake"


def portfolio_overlap(sector: str) -> list[dict]:
    return query(
        f"SELECT * FROM {SCHEMA}.portfolio_overlaps WHERE LOWER(sector) = LOWER(%s)",
        (sector,),
    )
