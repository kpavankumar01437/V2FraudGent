
from __future__ import annotations

import hashlib
import hmac
import json
import os
import pickle
import threading
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
import pandas as pd
import razorpay
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware


# ============================================================
# PATHS
# ============================================================

DEPLOY_DIR = Path(
    "/content/drive/MyDrive/"
    "razorpay_fraud_data/"
    "deployment/"
    "research_v2_api"
)

STATE_PATH = (
    DEPLOY_DIR
    / "research_v2_live_state.pkl"
)

EVENTS_PATH = (
    DEPLOY_DIR
    / "research_v2_processed_events.pkl"
)
DECISIONS_PATH = (
    DEPLOY_DIR
    / "research_v2_decisions.pkl"
)


# ============================================================
# FROZEN RUNTIME
# ============================================================

import sys

sys.path.insert(
    0,
    str(DEPLOY_DIR)
)

import research_v2_runtime as runtime


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="Research V2 Fraud Intelligence API",
    version="research_v2_65_15_20",
)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "V2FRAUDGENT_CORS_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=[
        "Content-Type",
        "X-Razorpay-Signature",
        "x-razorpay-event-id",
    ],
)

# ============================================================
# PROCESS LOCK
#
# This deployment is intentionally single-process / shadow-mode.
# Multi-worker deployment is NOT enabled here because the
# chronological ResearchV2State must not diverge between workers.
# ============================================================

STATE_LOCK = threading.Lock()


# ============================================================
# STATE
# ============================================================

def _new_state():
    return runtime.ResearchV2State()


def _load_state():
    if not STATE_PATH.exists():
        return _new_state()

    with STATE_PATH.open(
        "rb"
    ) as f:

        state = pickle.load(f)

    if not isinstance(
        state,
        runtime.ResearchV2State
    ):
        raise TypeError(
            "Persisted state is not ResearchV2State."
        )

    return state


def _save_state(state):
    tmp_path = (
        str(STATE_PATH)
        + ".tmp"
    )

    with open(
        tmp_path,
        "wb"
    ) as f:

        pickle.dump(
            state,
            f,
            protocol=pickle.HIGHEST_PROTOCOL
        )

    os.replace(
        tmp_path,
        STATE_PATH
    )


def _load_processed_events():
    if not EVENTS_PATH.exists():
        return set()

    with EVENTS_PATH.open(
        "rb"
    ) as f:

        events = pickle.load(f)

    if not isinstance(
        events,
        set
    ):
        raise TypeError(
            "Persisted event registry is not a set."
        )

    return events


def _save_processed_events(events):
    tmp_path = (
        str(EVENTS_PATH)
        + ".tmp"
    )

    with open(
        tmp_path,
        "wb"
    ) as f:

        pickle.dump(
            events,
            f,
            protocol=pickle.HIGHEST_PROTOCOL
        )

    os.replace(
        tmp_path,
        EVENTS_PATH
    )


def _load_decisions():
    if not DECISIONS_PATH.exists():
        return []

    with DECISIONS_PATH.open(
        "rb"
    ) as f:

        decisions = pickle.load(f)

    if not isinstance(
        decisions,
        list
    ):
        raise TypeError(
            "Persisted decisions is not a list."
        )

    return decisions


def _save_decisions(decisions):
    tmp_path = (
        str(DECISIONS_PATH)
        + ".tmp"
    )

    with open(
        tmp_path,
        "wb"
    ) as f:

        pickle.dump(
            decisions,
            f,
            protocol=pickle.HIGHEST_PROTOCOL
        )

    os.replace(
        tmp_path,
        DECISIONS_PATH
    )


DECISIONS = _load_decisions()


STATE = _load_state()
PROCESSED_EVENTS = _load_processed_events()


# ============================================================
# LAST TRANSACTION TIME
# ============================================================

def _last_transaction_dt(
    state
):
    values = []

    for mapping_name in [
        "card_times",
        "device_times",
        "email_times",
        "address_times",
    ]:

        mapping = getattr(
            state,
            mapping_name,
            {}
        )

        for times in mapping.values():

            if not times:
                continue

            for value in times:

                try:
                    values.append(
                        float(value)
                    )
                except Exception:
                    pass

    if not values:
        return None

    return max(values)


# ============================================================
# WEBHOOK SIGNATURE
# ============================================================

def verify_webhook_signature(
    raw_body: bytes,
    received_signature: str,
    secret: str,
) -> bool:

    if not received_signature:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(
        expected_signature,
        received_signature,
    )


# ============================================================
# PAYMENT EXTRACTION
# ============================================================

def extract_payment_entity(
    event: Dict[str, Any]
) -> Dict[str, Any]:

    # Direct payment fixture / direct payment entity.
    if (
        event.get("entity")
        == "payment"
    ):
        return event

    payload = event.get(
        "payload"
    )

    if not isinstance(
        payload,
        dict
    ):
        raise ValueError(
            "Webhook payload object is missing."
        )

    payment_wrapper = payload.get(
        "payment"
    )

    if not isinstance(
        payment_wrapper,
        dict
    ):
        raise ValueError(
            "payload.payment is missing."
        )

    payment = payment_wrapper.get(
        "entity"
    )

    if not isinstance(
        payment,
        dict
    ):
        raise ValueError(
            "payload.payment.entity is missing."
        )

    return payment


# ============================================================
# BASIC SAFE GET
# ============================================================

def _nested(
    obj,
    *keys
):

    current = obj

    for key in keys:

        if not isinstance(
            current,
            dict
        ):
            return None

        current = current.get(
            key
        )

    return current


# ============================================================
# RAZORPAY → RESEARCH V2 ADAPTER
#
# Only fields with a defensible mapping are populated.
#
# Everything else remains NaN.
# NO synthetic DeviceInfo / address / identity fields.
# ============================================================

def payment_to_research_row(
    payment: Dict[str, Any]
) -> pd.Series:

    payment_id = payment.get(
        "id"
    )

    created_at = payment.get(
        "created_at"
    )

    amount_subunits = payment.get(
        "amount"
    )

    currency = payment.get(
        "currency"
    )

    if payment_id is None:
        raise ValueError(
            "Payment id is required."
        )

    if created_at is None:
        raise ValueError(
            "Payment created_at is required."
        )

    if amount_subunits is None:
        raise ValueError(
            "Payment amount is required."
        )

    if str(currency).upper() != "INR":
        raise ValueError(
            "Research V2 Razorpay adapter currently "
            "accepts INR only."
        )

    # Razorpay amount is in currency subunits.
    transaction_amount = (
        float(amount_subunits)
        / 100.0
    )

    card = payment.get(
        "card"
    )

    if not isinstance(
        card,
        dict
    ):
        card = {}

    card_id = (
        payment.get("card_id")
        or card.get("id")
    )

    # --------------------------------------------------------
    # FROZEN MODEL BOUNDARY
    # Razorpay card_id may be alphanumeric.
    # Research V2 card1 is a numeric model feature.
    # Never hash or invent a numeric encoding.
    # --------------------------------------------------------
    card1_model_value = np.nan

    if card_id is not None:
        try:
            numeric_card_id = float(card_id)

            if np.isfinite(numeric_card_id):
                card1_model_value = numeric_card_id

        except (TypeError, ValueError):
            card1_model_value = np.nan


    network = card.get(
        "network"
    )

    card_type = card.get(
        "type"
    )

    email = payment.get(
        "email"
    )

    email_domain = None

    if isinstance(
        email,
        str
    ) and "@" in email:

        email_domain = (
            email.rsplit(
                "@",
                1
            )[1]
            .strip()
            .lower()
            or None
        )

    # --------------------------------------------------------
    # Exact source-column skeleton expected by the
    # Research V2 feature builder.
    # --------------------------------------------------------

    row = {

        "TransactionID":
            str(payment_id),

        "TransactionDT":
            int(created_at),

        "TransactionAmt":
            transaction_amount,

        # Card identity
        "card1": card1_model_value,
        # Defensible payment-card context
        "card4":
            (
                str(network).lower()
                if network is not None
                else np.nan
            ),

        "card6":
            (
                str(card_type).lower()
                if card_type is not None
                else np.nan
            ),

        # Email domain
        "P_emaildomain":
            email_domain,

        # ----------------------------------------------------
        # Fields unavailable from the Razorpay payment
        # payload are deliberately left missing.
        # ----------------------------------------------------

        "card2": np.nan,
        "card3": np.nan,
        "card5": np.nan,

        "addr1": np.nan,
        "addr2": np.nan,

        "ProductCD": np.nan,

        "DeviceType": np.nan,

        "R_emaildomain": np.nan,

        "dist1": np.nan,
        "dist2": np.nan,

        "C1": np.nan,
        "C2": np.nan,
        "C3": np.nan,
        "C4": np.nan,
        "C5": np.nan,
        "C6": np.nan,
        "C7": np.nan,
        "C8": np.nan,
        "C9": np.nan,
        "C10": np.nan,
        "C11": np.nan,
        "C12": np.nan,
        "C13": np.nan,
        "C14": np.nan,

        "D1": np.nan,
        "D2": np.nan,
        "D3": np.nan,
        "D4": np.nan,
        "D5": np.nan,
        "D6": np.nan,
        "D7": np.nan,
        "D8": np.nan,
        "D9": np.nan,
        "D10": np.nan,
        "D11": np.nan,
        "D12": np.nan,
        "D13": np.nan,
        "D14": np.nan,
        "D15": np.nan,

        "id_01": np.nan,
        "id_02": np.nan,
        "id_05": np.nan,
        "id_06": np.nan,
        "id_13": np.nan,
        "id_14": np.nan,
        "id_17": np.nan,
        "id_19": np.nan,
        "id_20": np.nan,
        "id_32": np.nan,
    }

    return pd.Series(
        row
    )


# ============================================================
# EVENT NAME
# ============================================================

def get_event_name(
    event: Dict[str, Any]
) -> Optional[str]:

    value = event.get(
        "event"
    )

    return (
        str(value)
        if value is not None
        else None
    )


# ============================================================
# HEALTH
# ============================================================

@app.get(
    "/health"
)
def health():

    return {
        "status": "ok",
        "model": "research_v2",
        "model_version":
            "research_v2_65_15_20",
        "feature_count":
            len(runtime.MODEL_FEATURES),
        "model_trees":
            runtime.MODEL.num_trees(),
        "review_threshold":
            runtime.REVIEW_THRESHOLD,
        "high_threshold":
            runtime.HIGH_THRESHOLD,
        "state_type":
            type(STATE).__name__,
    }

@app.post(
    "/api/create-order"
)
async def create_order(
    request: Request
):
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Request body must be valid JSON."
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="Request body must be an object."
        )

    amount_paise = payload.get("amount_paise")
    currency = str(
        payload.get("currency", "INR")
    ).upper()

    # Client sends integer paise. Never use a float for the
    # server-side Razorpay order amount.
    if (
        isinstance(amount_paise, bool)
        or not isinstance(amount_paise, int)
    ):
        raise HTTPException(
            status_code=400,
            detail="amount_paise must be an integer."
        )

    if amount_paise < 100:
        raise HTTPException(
            status_code=400,
            detail="Minimum test payment amount is 100 paise."
        )

    if amount_paise > 10000000:
        raise HTTPException(
            status_code=400,
            detail="Maximum demo payment amount is ?100,000."
        )

    if currency != "INR":
        raise HTTPException(
            status_code=400,
            detail="Only INR payments are supported by this demo."
        )

    key_id = os.environ.get(
        "RAZORPAY_KEY_ID"
    )

    key_secret = os.environ.get(
        "RAZORPAY_KEY_SECRET"
    )

    if not key_id or not key_secret:
        raise HTTPException(
            status_code=500,
            detail="Razorpay API credentials are not configured."
        )

    try:
        client = razorpay.Client(
            auth=(
                key_id,
                key_secret,
            )
        )

        order = client.order.create(
            data={
                "amount": amount_paise,
                "currency": currency,
                "receipt": (
                    f"v2fg_{int(__import__('time').time() * 1000)}"
                ),
                "notes": {
                    "source": "V2FraudGent",
                    "mode": "Research V2 demo",
                },
            }
        )

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to create Razorpay order."
        ) from exc

    return {
        "status": "ok",
        "key_id": key_id,
        "order": {
            "id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "status": order["status"],
        },
    }


@app.get(
    "/api/transactions"
)
def get_transactions(
    limit: int = 50
):
    if limit < 1:
        limit = 1

    if limit > 200:
        limit = 200

    with STATE_LOCK:
        recent = list(
            reversed(
                DECISIONS[-limit:]
            )
        )

    return {
        "status": "ok",
        "count": len(recent),
        "transactions": recent,
    }


# ============================================================
# WEBHOOK
# ============================================================

@app.post(
    "/razorpay/webhook"
)
async def razorpay_webhook(
    request: Request
):

    # --------------------------------------------------------
    # Secret
    # --------------------------------------------------------

    secret = os.environ.get(
        "RAZORPAY_WEBHOOK_SECRET"
    )

    if not secret:
        raise HTTPException(
            status_code=500,
            detail=(
                "RAZORPAY_WEBHOOK_SECRET "
                "is not configured."
            ),
        )

    # --------------------------------------------------------
    # RAW BODY FIRST
    # --------------------------------------------------------

    raw_body = await request.body()

    signature = request.headers.get(
        "X-Razorpay-Signature"
    )

    event_id = request.headers.get(
        "x-razorpay-event-id"
    )

    if not event_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing x-razorpay-event-id."
            ),
        )

    # --------------------------------------------------------
    # SIGNATURE
    # --------------------------------------------------------

    if not verify_webhook_signature(
        raw_body,
        signature or "",
        secret,
    ):
        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid Razorpay webhook signature."
            ),
        )

    # --------------------------------------------------------
    # JSON
    # --------------------------------------------------------

    try:
        event = json.loads(
            raw_body.decode(
                "utf-8"
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid JSON webhook body."
            ),
        ) from exc

    if not isinstance(
        event,
        dict
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Webhook root must be an object."
            ),
        )

    event_name = get_event_name(
        event
    )

    # --------------------------------------------------------
    # DUPLICATE EVENT
    # --------------------------------------------------------

    with STATE_LOCK:

        if event_id in PROCESSED_EVENTS:

            return JSONResponse(
                status_code=200,
                content={
                    "status": "duplicate",
                    "event_id": event_id,
                    "processed": False,
                },
            )

    # --------------------------------------------------------
    # Only payment.captured is scored.
    #
    # We intentionally do not score payment.authorized or
    # payment.failed because scoring the same payment lifecycle
    # more than once would advance chronological state multiple
    # times for one payment.
    # --------------------------------------------------------

    if event_name != "payment.captured":

        with STATE_LOCK:

            PROCESSED_EVENTS.add(
                event_id
            )

            _save_processed_events(
                PROCESSED_EVENTS
            )

        return {
            "status": "ignored",
            "event_id": event_id,
            "event": event_name,
            "processed": False,
            "reason": (
                "Research V2 shadow mode "
                "scores payment.captured only."
            ),
        }

    # --------------------------------------------------------
    # PAYMENT ENTITY
    # --------------------------------------------------------

    try:

        payment = extract_payment_entity(
            event
        )

        row = payment_to_research_row(
            payment
        )

    except Exception as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc)
        ) from exc

    # --------------------------------------------------------
    # CHRONOLOGICAL GUARD
    # --------------------------------------------------------

    incoming_dt = float(
        row["TransactionDT"]
    )

    with STATE_LOCK:

        previous_dt = _last_transaction_dt(
            STATE
        )

        if (
            previous_dt is not None
            and incoming_dt < previous_dt
        ):

            return JSONResponse(
                status_code=409,
                content={
                    "status": "deferred",
                    "event_id": event_id,
                    "event": event_name,
                    "reason":
                        "Incoming payment is older than "
                        "the latest scored transaction. "
                        "Research V2 chronological state "
                        "was NOT modified.",
                    "previous_transaction_dt":
                        previous_dt,
                    "incoming_transaction_dt":
                        incoming_dt,
                },
            )

        # ----------------------------------------------------
        # SCORE EXACTLY ONCE
        # ----------------------------------------------------

        result = runtime.score_transaction(
            row,
            STATE
        )

        decision_record = {
            "event_id": event_id,
            "transaction_id": result.get(
                "transaction_id"
            ),
            "created_at": int(
                row["TransactionDT"]
            ),
            "amount": float(
                row["TransactionAmt"]
            ),
            "currency": str(
                payment.get(
                    "currency",
                    "INR"
                )
            ).upper(),
            "raw_probability": result.get(
                "raw_probability"
            ),
            "calibrated_risk_score": result.get(
                "calibrated_risk_score"
            ),
            "risk_zone": result.get(
                "risk_zone"
            ),
            "recommended_action": result.get(
                "recommended_action"
            ),
            "primary_evidence": result.get(
                "primary_evidence",
                []
            ),
            "supporting_evidence": result.get(
                "supporting_evidence",
                []
            ),
        }

        DECISIONS.append(
            decision_record
        )

        # Keep the audit store bounded.
        if len(DECISIONS) > 1000:
            del DECISIONS[:-1000]

        # Persist only AFTER successful scoring/state update.
        _save_state(
            STATE
        )

        PROCESSED_EVENTS.add(
            event_id
        )

        _save_processed_events(
            PROCESSED_EVENTS
        )

        _save_decisions(
            DECISIONS
        )

    return {
        "status": "scored",
        "event_id": event_id,
        "event": event_name,
        "processed": True,
        "transaction": result,
    }

# ============================================================
# LOCAL TEST HELPER
# ============================================================

def build_test_event():

    return {
        "entity": "event",
        "account_id":
            "acc_test_fixture",
        "event":
            "payment.captured",
        "contains": [
            "payment"
        ],
        "payload": {
            "payment": {
                "entity": {
                    "id":
                        "pay_local_research_v2_001",
                    "entity":
                        "payment",
                    "amount":
                        25000,
                    "currency":
                        "INR",
                    "status":
                        "captured",
                    "order_id":
                        "order_local_research_v2_001",
                    "invoice_id":
                        None,
                    "international":
                        False,
                    "method":
                        "card",
                    "amount_refunded":
                        0,
                    "refund_status":
                        None,
                    "captured":
                        True,
                    "description":
                        "Research V2 integration test",
                    "card_id":
                        "card_local_research_v2_001",
                    "card": {
                        "id":
                            "card_local_research_v2_001",
                        "entity":
                            "card",
                        "name":
                            "TEST USER",
                        "iin":
                            "999999",
                        "last4":
                            "0153",
                        "network":
                            "Visa",
                        "type":
                            "debit",
                        "sub_type":
                            "business",
                        "international":
                            False,
                        "emi":
                            False,
                        "issuer":
                            None,
                    },
                    "email":
                        "test.user@example.com",
                    "contact":
                        "+919999999999",
                    "fee":
                        None,
                    "tax":
                        None,
                    "error_code":
                        None,
                    "error_description":
                        None,
                    "error_source":
                        None,
                    "error_step":
                        None,
                    "error_reason":
                        None,
                    "notes":
                        {},
                    "created_at":
                        1788400000,
                    "upi":
                        None,
                    "bank":
                        None,
                    "vpa":
                        None,
                    "wallet":
                        None,
                    "acquirer_data": {
                        "auth_code":
                            "TEST001",
                        "rrn":
                            "TESTRRN001",
                    },
                }
            }
        },
        "created_at":
            1788400001,
    }
