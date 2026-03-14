import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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