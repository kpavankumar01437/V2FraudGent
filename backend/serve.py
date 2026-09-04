from __future__ import annotations

import os

from fastapi.middleware.cors import CORSMiddleware

# Import the exact validated Research V2 application unchanged.
from app import app as research_v2_app


DEFAULT_LOCAL_ORIGINS = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]


def _allowed_origins() -> list[str]:
    raw = os.environ.get("V2FRAUDGENT_ALLOWED_ORIGINS", "")
    if not raw.strip():
        return DEFAULT_LOCAL_ORIGINS

    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or DEFAULT_LOCAL_ORIGINS


research_v2_app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "POST", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "X-Razorpay-Signature",
        "x-razorpay-event-id",
    ],
)


app = research_v2_app
