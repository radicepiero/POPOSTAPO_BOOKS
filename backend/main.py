import pathlib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .config import settings
from .database import engine
from .models import Base
from .routers import copies, editions, readings


Base.metadata.create_all(bind=engine)

app = FastAPI(title="POPOSTAPO Books")

upload_dir = pathlib.Path(__file__).resolve().parent / "uploads"
upload_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(copies.router, prefix="/api")
app.include_router(editions.router, prefix="/api")
app.include_router(readings.router, prefix="/api")


@app.get("/health")
def health():
    return {"ok": True, "service": "books"}
