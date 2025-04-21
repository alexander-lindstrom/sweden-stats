from fastapi import APIRouter, HTTPException
import json
from pathlib import Path

router = APIRouter()

DATA_PATH = Path("../data/economy/state_expenses_1997_2024.json")

@router.get("/api/expenses/")
async def get_all_expenses():
    try:
        with open(DATA_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load expense data: {str(e)}")

@router.get("/api/expenses/{year}")
async def get_expenses_by_year(year: str):
    try:
        with open(DATA_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if year not in data:
            raise HTTPException(status_code=404, detail=f"No data for year {year}")
        return data[year]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load expense data: {str(e)}")
