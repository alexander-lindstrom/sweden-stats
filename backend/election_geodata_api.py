from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path

router = APIRouter()

DATA_DIR = Path("../data/elections")

VALID_ELECTION_TYPES = {"riksdag", "regionval", "kommunval"}
VALID_LEVELS         = {"deso", "regso"}


@router.get("/api/election-geodata/{election_type}/{year}/{level}")
async def get_election_geodata(election_type: str, year: int, level: str):
    if election_type not in VALID_ELECTION_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown election type '{election_type}'")
    if level not in VALID_LEVELS:
        raise HTTPException(status_code=400, detail=f"Unknown level '{level}'")

    path = DATA_DIR / f"{election_type}_{year}_{level}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No data for {election_type} {year} {level}")

    return FileResponse(path, media_type="application/json")
