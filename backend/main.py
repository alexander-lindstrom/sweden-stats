import os
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from state_expenses_api import router as state_expenses_router
from election_geodata_api import router as election_geodata_router

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(state_expenses_router)
app.include_router(election_geodata_router)


@app.api_route("/api/kolada/{path:path}", methods=["GET"])
async def kolada_proxy(path: str, request: Request) -> Response:
    url = f"https://api.kolada.se/v3/{path}"
    if request.url.query:
        url += f"?{request.url.query}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Kolada did not respond in time")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Kolada request failed: {exc}")
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )