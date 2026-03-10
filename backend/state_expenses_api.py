import os
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter()

_DATA_BASE = Path(os.getenv("DATA_DIR", str(Path(__file__).parent.parent / "data")))
EXPENSES_DATA_PATH = _DATA_BASE / "economy/state_expenses_1997_2024.json"
REVENUE_DATA_PATH  = _DATA_BASE / "economy/state_revenue_2006_2024.json"

@router.get("/api/expenses/")
async def get_all_expenses():
    try:
        with open(EXPENSES_DATA_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load expense data")

@router.get("/api/expenses/{year}")
async def get_expenses_by_year(year: str):
    try:
        with open(EXPENSES_DATA_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if year not in data:
            raise HTTPException(status_code=404, detail=f"No data for year {year}")
        return data[year]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load expense data")

@router.get("/api/revenue/")
async def get_all_revenue():
    try:
        with open(REVENUE_DATA_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load revenue data")
