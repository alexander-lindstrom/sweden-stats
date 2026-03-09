import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from state_expenses_api import router as state_expenses_router
from election_geodata_api import router as election_geodata_router
import httpx

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(state_expenses_router)
app.include_router(election_geodata_router)

BASE_SCB_URL = "https://api.scb.se/OV0104/v1/doris/sv/ssd"

@app.post("/api/scb/{path:path}")
async def proxy_scb_post(path: str, request: Request):
    """
    Proxies a POST request to the SCB API.
    Example path: START/PR/PR0101/PR0101A/KPICOI80MN
    """
    try:
        body = await request.json()
        url = f"{BASE_SCB_URL}/{path}"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=body,
                headers={"Content-Type": "application/json"},
                timeout=30.0,
            )
        return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))