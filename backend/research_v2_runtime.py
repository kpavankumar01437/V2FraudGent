import os
import json
import numpy as np
from scipy.special import expit, logit
import pandas as pd
import lightgbm as lgb

# ============================================================
# RECOVERED EXACT RESEARCH V2 STATE / FEATURE ENGINE
# Source: validated notebook history cell 41
# ============================================================

def frequency_lookup(
    feature_name,
    value
):

    info = FREQ_MAPS[
        feature_name
    ]

    if pd.isna(value):

        missing_frequency = (
            info["missing_frequency"]
        )

        if missing_frequency is None:
            return 0.0

        return float(
            missing_frequency
        )

    return float(
        info["values"].get(
            str(value),
            0.0
        )
    )

def build_frequency_features(row):

    features = {}

    for feature_name, source_col in (
        FREQUENCY_SOURCE_COLUMNS.items()
    ):

        features[feature_name] = (
            frequency_lookup(
                feature_name,
                row.get(
                    source_col,
                    np.nan
                )
            )
        )

    return features

def safe_ratio(
    numerator,
    denominator,
    default=0.0
):

    if denominator is None:
        return default

    if not np.isfinite(denominator):
        return default

    if denominator <= 0:
        return default

    if numerator is None:
        return default

    if not np.isfinite(numerator):
        return default

    return numerator / denominator

def make_card_key(value):

    if pd.isna(value):
        return None

    return str(value)

def make_device_key(value):

    if pd.isna(value):
        return None

    return str(value)

def make_email_key(value):

    if pd.isna(value):
        return None

    return str(value)

def make_addr_key(
    addr1,
    addr2
):

    if pd.isna(addr1) and pd.isna(addr2):
        return None

    a1 = (
        "<NA>"
        if pd.isna(addr1)
        else str(addr1)
    )

    a2 = (
        "<NA>"
        if pd.isna(addr2)
        else str(addr2)
    )

    return a1 + "_" + a2

def add_entity_keys(row):

    if isinstance(row, pd.DataFrame):

        if len(row) != 1:
            raise ValueError(
                "Expected exactly one transaction row."
            )

        row = row.iloc[0]

    if not isinstance(row, pd.Series):

        row = pd.Series(row)

    row = row.copy()

    row["card_key"] = make_card_key(
        row.get("card1", np.nan)
    )

    row["device_key"] = make_device_key(
        row.get("DeviceInfo", np.nan)
    )

    row["email_key"] = make_email_key(
        row.get("P_emaildomain", np.nan)
    )

    row["addr_key"] = make_addr_key(
        row.get("addr1", np.nan),
        row.get("addr2", np.nan)
    )

    return row

class ResearchV2State:

    def __init__(self):

        self.cards = {}
        self.devices = {}
        self.emails = {}
        self.addresses = {}

        self.card_devices = {}
        self.card_emails = {}
        self.card_addresses = {}

        self.card_times = {}
        self.device_times = {}
        self.email_times = {}
        self.address_times = {}


    @staticmethod
    def empty_entity():

        return {
            "count": 0,
            "amount": 0.0,
            "last_time": None
        }


    def get_entity(
        self,
        container,
        key
    ):

        if key is None:
            return self.empty_entity()

        return container.get(
            key,
            self.empty_entity()
        )


    @staticmethod
    def recent_count(
        times,
        current_time,
        window_seconds
    ):

        if times is None:
            return 0

        threshold = (
            current_time
            - window_seconds
        )

        left = np.searchsorted(
            times,
            threshold,
            side="right"
        )

        return len(times) - left


    def build_features(self, row):

        current_time = float(
            row["TransactionDT"]
        )

        amount = float(
            row["TransactionAmt"]
        )

        card_key = make_card_key(
            row.get("card1", np.nan)
        )

        device_key = make_device_key(
            row.get("DeviceInfo", np.nan)
        )

        email_key = make_email_key(
            row.get("P_emaildomain", np.nan)
        )

        addr_key = make_addr_key(
            row.get("addr1", np.nan),
            row.get("addr2", np.nan)
        )

        card = self.get_entity(
            self.cards,
            card_key
        )

        device = self.get_entity(
            self.devices,
            device_key
        )

        email = self.get_entity(
            self.emails,
            email_key
        )

        address = self.get_entity(
            self.addresses,
            addr_key
        )

        # ----------------------------------------------------
        # ENTITY HISTORY
        # ----------------------------------------------------

        card_prev_count = card["count"]
        card_prev_amount = card["amount"]

        card_prev_avg_amount = safe_ratio(
            card_prev_amount,
            card_prev_count
        )

        card_amount_ratio = safe_ratio(
            amount,
            card_prev_avg_amount
        )

        device_prev_count = device["count"]
        device_prev_amount = device["amount"]

        device_prev_avg_amount = safe_ratio(
            device_prev_amount,
            device_prev_count
        )

        device_amount_ratio = safe_ratio(
            amount,
            device_prev_avg_amount
        )

        email_prev_count = email["count"]
        email_prev_amount = email["amount"]

        email_prev_avg_amount = safe_ratio(
            email_prev_amount,
            email_prev_count
        )

        email_amount_ratio = safe_ratio(
            amount,
            email_prev_avg_amount
        )

        addr_prev_count = address["count"]
        addr_prev_amount = address["amount"]

        addr_prev_avg_amount = safe_ratio(
            addr_prev_amount,
            addr_prev_count
        )

        addr_amount_ratio = safe_ratio(
            amount,
            addr_prev_avg_amount
        )

        # ----------------------------------------------------
        # VELOCITY
        # ----------------------------------------------------

        card_1h = self.recent_count(
            self.card_times.get(
                card_key,
                []
            ),
            current_time,
            3600
        )

        card_24h = self.recent_count(
            self.card_times.get(
                card_key,
                []
            ),
            current_time,
            86400
        )

        device_1h = self.recent_count(
            self.device_times.get(
                device_key,
                []
            ),
            current_time,
            3600
        )

        device_24h = self.recent_count(
            self.device_times.get(
                device_key,
                []
            ),
            current_time,
            86400
        )

        email_1h = self.recent_count(
            self.email_times.get(
                email_key,
                []
            ),
            current_time,
            3600
        )

        email_24h = self.recent_count(
            self.email_times.get(
                email_key,
                []
            ),
            current_time,
            86400
        )

        addr_1h = self.recent_count(
            self.address_times.get(
                addr_key,
                []
            ),
            current_time,
            3600
        )

        addr_24h = self.recent_count(
            self.address_times.get(
                addr_key,
                []
            ),
            current_time,
            86400
        )

        # ----------------------------------------------------
        # RELATIONSHIPS
        # ----------------------------------------------------

        card_device_prev_count = (
            self.card_devices.get(
                (
                    card_key,
                    device_key
                ),
                0
            )
        )

        card_device_new = int(
            card_key is not None
            and device_key is not None
            and card_device_prev_count == 0
        )

        card_email_prev_count = (
            self.card_emails.get(
                (
                    card_key,
                    email_key
                ),
                0
            )
        )

        card_email_new = int(
            card_key is not None
            and email_key is not None
            and card_email_prev_count == 0
        )

        card_addr_prev_count = (
            self.card_addresses.get(
                (
                    card_key,
                    addr_key
                ),
                0
            )
        )

        card_addr_new = int(
            card_key is not None
            and addr_key is not None
            and card_addr_prev_count == 0
        )

        # ----------------------------------------------------
        # RESEARCH SIGNALS
        # ----------------------------------------------------

        card_established = int(
            card_prev_count >= 5
        )

        card_new_device_established = int(
            card_established == 1
            and card_device_prev_count == 0
            and device_key is not None
        )

        card_new_address_established = int(
            card_established == 1
            and card_addr_prev_count == 0
            and addr_key is not None
        )

        card_new_email_established = int(
            card_established == 1
            and card_email_prev_count == 0
            and email_key is not None
        )

        card_identity_break_count = int(
            card_established == 1
        ) * (
            card_new_device_established
            + card_new_address_established
            + card_new_email_established
        )

        card_amount_deviation = np.float32(
            np.log1p(
                np.clip(
                    card_amount_ratio,
                    0,
                    1e6
                )
            )
        )

        device_amount_deviation = np.float32(
            np.log1p(
                np.clip(
                    device_amount_ratio,
                    0,
                    1e6
                )
            )
        )

        card_amount_deviation_2x = int(
            card_amount_ratio > 2.0
        )

        device_amount_deviation_2x = int(
            device_amount_ratio > 2.0
        )

        account_takeover_proxy = int(
            card_established == 1
            and card_identity_break_count >= 1
            and (
                card_amount_deviation_2x == 1
                or
                device_amount_deviation_2x == 1
            )
        )

        return {
            "card_prev_count":
                card_prev_count,

            "card_prev_amount":
                card_prev_amount,

            "card_prev_avg_amount":
                card_prev_avg_amount,

            "card_amount_ratio":
                card_amount_ratio,

            "device_prev_count":
                device_prev_count,

            "device_prev_amount":
                device_prev_amount,

            "device_prev_avg_amount":
                device_prev_avg_amount,

            "device_amount_ratio":
                device_amount_ratio,

            "email_prev_count":
                email_prev_count,

            "email_prev_amount":
                email_prev_amount,

            "email_prev_avg_amount":
                email_prev_avg_amount,

            "email_amount_ratio":
                email_amount_ratio,

            "addr_prev_count":
                addr_prev_count,

            "addr_prev_amount":
                addr_prev_amount,

            "addr_prev_avg_amount":
                addr_prev_avg_amount,

            "addr_amount_ratio":
                addr_amount_ratio,

            "card_prev_1h":
                card_1h,

            "card_prev_24h":
                card_24h,

            "device_prev_1h":
                device_1h,

            "device_prev_24h":
                device_24h,

            "email_prev_1h":
                email_1h,

            "email_prev_24h":
                email_24h,

            "addr_prev_1h":
                addr_1h,

            "addr_prev_24h":
                addr_24h,

            "card_device_prev_count":
                card_device_prev_count,

            "card_device_new":
                card_device_new,

            "card_email_prev_count":
                card_email_prev_count,

            "card_email_new":
                card_email_new,

            "card_addr_prev_count":
                card_addr_prev_count,

            "card_addr_new":
                card_addr_new,

            "card_established":
                card_established,

            "card_new_device_established":
                card_new_device_established,

            "card_identity_break_count":
                card_identity_break_count,

            "device_amount_deviation":
                device_amount_deviation,

            "card_amount_deviation":
                card_amount_deviation,

            "device_amount_deviation_2x":
                device_amount_deviation_2x,

            "card_amount_deviation_2x":
                card_amount_deviation_2x,

            "account_takeover_proxy":
                account_takeover_proxy
        }


    def update(self, row):

        current_time = float(
            row["TransactionDT"]
        )

        amount = float(
            row["TransactionAmt"]
        )

        card_key = make_card_key(
            row.get("card1", np.nan)
        )

        device_key = make_device_key(
            row.get("DeviceInfo", np.nan)
        )

        email_key = make_email_key(
            row.get("P_emaildomain", np.nan)
        )

        addr_key = make_addr_key(
            row.get("addr1", np.nan),
            row.get("addr2", np.nan)
        )

        # ----------------------------------------------------
        # CARD
        # ----------------------------------------------------

        if card_key is not None:

            state = self.cards.setdefault(
                card_key,
                self.empty_entity()
            )

            state["count"] += 1
            state["amount"] += amount
            state["last_time"] = current_time

            self.card_times.setdefault(
                card_key,
                []
            ).append(current_time)

        # ----------------------------------------------------
        # DEVICE
        # ----------------------------------------------------

        if device_key is not None:

            state = self.devices.setdefault(
                device_key,
                self.empty_entity()
            )

            state["count"] += 1
            state["amount"] += amount
            state["last_time"] = current_time

            self.device_times.setdefault(
                device_key,
                []
            ).append(current_time)

        # ----------------------------------------------------
        # EMAIL
        # ----------------------------------------------------

        if email_key is not None:

            state = self.emails.setdefault(
                email_key,
                self.empty_entity()
            )

            state["count"] += 1
            state["amount"] += amount
            state["last_time"] = current_time

            self.email_times.setdefault(
                email_key,
                []
            ).append(current_time)

        # ----------------------------------------------------
        # ADDRESS
        # ----------------------------------------------------

        if addr_key is not None:

            state = self.addresses.setdefault(
                addr_key,
                self.empty_entity()
            )

            state["count"] += 1
            state["amount"] += amount
            state["last_time"] = current_time

            self.address_times.setdefault(
                addr_key,
                []
            ).append(current_time)

        # ----------------------------------------------------
        # RELATIONSHIPS
        # ----------------------------------------------------

        if (
            card_key is not None
            and device_key is not None
        ):

            pair = (
                card_key,
                device_key
            )

            self.card_devices[pair] = (
                self.card_devices.get(
                    pair,
                    0
                ) + 1
            )

        if (
            card_key is not None
            and email_key is not None
        ):

            pair = (
                card_key,
                email_key
            )

            self.card_emails[pair] = (
                self.card_emails.get(
                    pair,
                    0
                ) + 1
            )

        if (
            card_key is not None
            and addr_key is not None
        ):

            pair = (
                card_key,
                addr_key
            )

            self.card_addresses[pair] = (
                self.card_addresses.get(
                    pair,
                    0
                ) + 1
            )

def build_static_features(row):

    features = {}

    direct_fields = [
        "TransactionDT",
        "TransactionAmt",
        "card1",
        "card2",
        "card3",
        "card5",
        "addr1",
        "addr2",
        "dist1",
        "dist2"
    ]

    for col in direct_fields:

        features[col] = row.get(
            col,
            np.nan
        )

    for i in range(1, 15):

        col = f"C{i}"

        features[col] = row.get(
            col,
            np.nan
        )

    for i in range(1, 16):

        col = f"D{i}"

        features[col] = row.get(
            col,
            np.nan
        )

    for col in [
        "id_01",
        "id_02",
        "id_05",
        "id_06",
        "id_13",
        "id_14",
        "id_17",
        "id_19",
        "id_20",
        "id_32"
    ]:

        features[col] = row.get(
            col,
            np.nan
        )

    transaction_dt = int(
        row["TransactionDT"]
    )

    features["hour"] = (
        transaction_dt // 3600
    ) % 24

    # Use saved weekday when available.
    # Otherwise use the validated periodic definition.
    if "weekday" in row.index:

        features["weekday"] = row["weekday"]

    else:

        features["weekday"] = (
            transaction_dt // 86400
        ) % 7

    amount = float(
        row["TransactionAmt"]
    )

    features["amount_log"] = (
        np.log1p(
            max(amount, 0.0)
        )
    )

    # Match the original preprocessing count.
    missing_columns = (
        [
            "TransactionAmt",
            "card1",
            "card2",
            "card3",
            "card5",
            "addr1",
            "addr2",
            "dist1",
            "dist2"
        ]
        +
        [f"C{i}" for i in range(1, 15)]
        +
        [f"D{i}" for i in range(1, 16)]
        +
        [
            "id_01",
            "id_02",
            "id_05",
            "id_06",
            "id_13",
            "id_14",
            "id_17",
            "id_19",
            "id_20",
            "id_32"
        ]
    )

    missing_count = 0

    for col in missing_columns:

        if pd.isna(
            row.get(
                col,
                np.nan
            )
        ):

            missing_count += 1

    features[
        "missing_feature_count"
    ] = missing_count

    return features

def build_research_v2_features(
    row,
    state
):

    if isinstance(
        row,
        pd.DataFrame
    ):

        if len(row) != 1:
            raise ValueError(
                "Expected one transaction row."
            )

        row = row.iloc[0]

    if not isinstance(
        row,
        pd.Series
    ):

        raise TypeError(
            "row must be a pandas Series."
        )

    row = add_entity_keys(row)

    features = build_static_features(
        row
    )

    state_features = (
        state.build_features(row)
    )

    features.update(
        state_features
    )

    card_established = int(
        state_features[
            "card_prev_count"
        ] >= 5
    )

    card_identity_break_count = int(
        state_features.get(
            "card_identity_break_count",
            0
        )
    )

    card_amount_ratio = (
        state_features[
            "card_amount_ratio"
        ]
    )

    device_amount_ratio = (
        state_features[
            "device_amount_ratio"
        ]
    )

    card_amount_deviation = np.float32(
        np.log1p(
            np.clip(
                card_amount_ratio,
                0,
                1e6
            )
        )
    )

    device_amount_deviation = np.float32(
        np.log1p(
            np.clip(
                device_amount_ratio,
                0,
                1e6
            )
        )
    )

    card_amount_deviation_2x = np.int8(
        card_amount_ratio > 2.0
    )

    device_amount_deviation_2x = np.int8(
        device_amount_ratio > 2.0
    )

    features[
        "device_amount_deviation"
    ] = device_amount_deviation

    features[
        "card_amount_deviation"
    ] = card_amount_deviation

    features[
        "device_amount_deviation_2x"
    ] = device_amount_deviation_2x

    features[
        "card_amount_deviation_2x"
    ] = card_amount_deviation_2x

    features[
        "card_new_device_established"
    ] = state_features.get(
        "card_new_device_established",
        0
    )

    account_takeover_proxy = np.int8(
        (
            card_established == 1
        )
        and
        (
            card_identity_break_count >= 1
        )
        and
        (
            card_amount_deviation_2x == 1
            or
            device_amount_deviation_2x == 1
        )
    )

    features[
        "account_takeover_proxy"
    ] = account_takeover_proxy

    features.update(
        build_frequency_features(
            row
        )
    )

    missing = [
        feature
        for feature in MODEL_FEATURES
        if feature not in features
    ]

    if missing:

        raise ValueError(
            "Missing Research V2 features: "
            + str(missing)
        )

    X = pd.DataFrame(
        [
            [
                features[feature]
                for feature in MODEL_FEATURES
            ]
        ],
        columns=MODEL_FEATURES
    )

    X = X.replace(
        [np.inf, -np.inf],
        np.nan
    )

    return X

# Compatibility alias for validated historical code.
FraudState = ResearchV2State

# ============================================================
# CANONICAL TRANSACTION SCORING / EVIDENCE
# Source: validated notebook history cell 22
# IMPORTANT: cell 21 is intentionally NOT used.
# ============================================================

# ============================================================
# CANONICAL RESEARCH V2 SCORER
# Recovered exactly from validated notebook Cell 22.
# ============================================================

def calibrate_research_v2(raw_probability):
    """
    Exact frozen sigmoid-logit calibration.

    p_cal = sigmoid(intercept + coef * logit(p_raw))
    """
    p = np.asarray(raw_probability, dtype=np.float64)

    p = np.clip(
        p,
        1e-15,
        1.0 - 1e-15
    )

    return expit(
        CAL_INTERCEPT +
        CAL_COEF * logit(p)
    )

def classify_risk(calibrated_probability):
    p = float(calibrated_probability)

    if p >= HIGH_THRESHOLD:
        return "HIGH"

    if p >= REVIEW_THRESHOLD:
        return "MEDIUM"

    return "LOW"

def recommended_action(risk_zone):

    if risk_zone == "HIGH":
        return "HOLD_INVESTIGATE"

    if risk_zone == "MEDIUM":
        return "REVIEW"

    return "ALLOW_MONITOR"

def generate_reason_codes(features, state):
    """
    Generate interpretable transaction-side evidence.

    This function only uses evidence available from the
    pre-transaction state and current transaction features.
    """

    primary = []
    supporting = []

    # --------------------------------------------------------
    # R01 — Established card + unseen device
    # --------------------------------------------------------

    if (
        features.get("card_new_device_established", 0) == 1
    ):
        primary.append({
            "code": "R01",
            "label": "Established card + unseen device"
        })

    # --------------------------------------------------------
    # R02 — Established card + multiple identity deviations
    # --------------------------------------------------------

    identity_break = (
        features.get("account_takeover_proxy", 0) == 1
    )

    if identity_break:
        primary.append({
            "code": "R02",
            "label": "Established identity with behavioral takeover signal"
        })

    # --------------------------------------------------------
    # R03 — Card amount deviation
    # --------------------------------------------------------

    if (
        features.get("card_amount_deviation_2x", 0) == 1
    ):
        supporting.append({
            "code": "R03",
            "label": "Transaction amount >2× historical card baseline"
        })

    # --------------------------------------------------------
    # R04 — Device amount deviation
    # --------------------------------------------------------

    if (
        features.get("device_amount_deviation_2x", 0) == 1
    ):
        supporting.append({
            "code": "R04",
            "label": "Transaction amount >2× historical device baseline"
        })

    # --------------------------------------------------------
    # R06 — General takeover proxy
    # --------------------------------------------------------

    if (
        features.get("account_takeover_proxy", 0) == 1
        and not any(x["code"] == "R02" for x in primary)
    ):
        supporting.append({
            "code": "R06",
            "label": "Established identity with behavioral takeover proxy"
        })

    return primary, supporting

def score_transaction(row, state):
    """
    Score ONE transaction in chronological order.

    IMPORTANT:
        1. Build features from PRE-TRANSACTION state.
        2. Score.
        3. Generate evidence.
        4. Update state only AFTER scoring.

    Returns a deterministic user-facing result.
    """

    # --------------------------------------------------------
    # Normalize row
    # --------------------------------------------------------

    if isinstance(row, pd.Series):
        row = row.copy()

    elif isinstance(row, dict):
        row = pd.Series(row)

    else:
        raise TypeError(
            "row must be a pandas Series or dict"
        )

    # --------------------------------------------------------
    # Entity keys
    # --------------------------------------------------------

    row = add_entity_keys(row)

    # --------------------------------------------------------
    # PRE-TRANSACTION state → 92 features
    # --------------------------------------------------------

    feature_series = build_research_v2_features(
        row,
        state
    )

    # Ensure model order exactly matches frozen schema.
    feature_series = feature_series[
        MODEL_FEATURES
    ]

    X = feature_series.copy()

    # Numerical normalization.
    X = X.replace(
        [np.inf, -np.inf],
        np.nan
    )

    # --------------------------------------------------------
    # Raw Research V2 score
    # --------------------------------------------------------

    raw_probability = float(
        research_v2_model.predict(
            X,
            num_iteration=research_v2_model.num_trees()
        )[0]
    )

    # --------------------------------------------------------
    # Frozen calibration
    # --------------------------------------------------------

    calibrated_probability = float(
        calibrate_research_v2(
            raw_probability
        )[()]
    )

    # --------------------------------------------------------
    # Risk policy
    # --------------------------------------------------------

    risk_zone = classify_risk(
        calibrated_probability
    )

    action = recommended_action(
        risk_zone
    )

    # --------------------------------------------------------
    # Evidence
    # --------------------------------------------------------

    primary, supporting = generate_reason_codes(
        feature_series.iloc[0],
        state
    )

    # --------------------------------------------------------
    # Update state AFTER scoring
    # --------------------------------------------------------

    state.update(row)

    # --------------------------------------------------------
    # Final response
    # --------------------------------------------------------

    transaction_id = (
        row.get("TransactionID", None)
    )

    return {
        "transaction_id": transaction_id,

        "raw_probability":
            raw_probability,

        "calibrated_risk_score":
            calibrated_probability,

        "risk_zone":
            risk_zone,

        "recommended_action":
            action,

        "primary_evidence":
            primary,

        "supporting_evidence":
            supporting,

        "decision_basis": {
            "model": "research_v2",
            "model_version":
                "research_v2_65_15_20",
            "feature_count": 92,
            "calibration":
                "sigmoid_logit_calibration",
            "calibration_intercept":
                CAL_INTERCEPT,
            "calibration_coefficient":
                CAL_COEF,
            "review_threshold":
                REVIEW_THRESHOLD,
            "high_threshold":
                HIGH_THRESHOLD
        },

        "disclaimer":
            "Evidence signals are transaction-side proxies "
            "and do not by themselves confirm fraud."
    }

# ============================================================
# FROZEN RESEARCH V2 DEPLOYMENT BOOTSTRAP


# ============================================================
# FROZEN RESEARCH V2 DEPLOYMENT BOOTSTRAP
#
# Loads only the already-frozen deployment artifacts.
# No training and no replay occur during import.
# ============================================================

import json as _research_v2_json
import lightgbm as _research_v2_lgb

BASE_DIR = "/content/drive/MyDrive/razorpay_fraud_data"

MODEL_PATH = (
    BASE_DIR
    + "/models/"
      "fraud_lgbm_research_v2_65_15_20.txt"
)

FREQ_PATH = (
    BASE_DIR
    + "/models/"
      "research_v2_frequency_maps.json"
)

SCHEMA_PATH = (
    BASE_DIR
    + "/models/"
      "research_v2_feature_schema_recovered.json"
)

CALIBRATION_PATH = (
    BASE_DIR
    + "/models/"
      "research_v2_calibrator.json"
)


# ------------------------------------------------------------
# Frozen feature schema
# ------------------------------------------------------------

with open(
    SCHEMA_PATH,
    "r",
    encoding="utf-8"
) as _f:

    _schema_payload = _research_v2_json.load(
        _f
    )

if isinstance(
    _schema_payload,
    list
):

    MODEL_FEATURES = list(
        _schema_payload
    )

else:

    MODEL_FEATURES = list(
        _schema_payload["features"]
    )

assert len(
    MODEL_FEATURES
) == 92


# ------------------------------------------------------------
# Frozen frequency maps
# ------------------------------------------------------------

with open(
    FREQ_PATH,
    "r",
    encoding="utf-8"
) as _f:

    _freq_payload = _research_v2_json.load(
        _f
    )

FREQ_MAPS = _freq_payload[
    "features"
]

assert len(
    FREQ_MAPS
) == 9

FREQUENCY_SOURCE_COLUMNS = {

    "ProductCD_freq":
        "ProductCD",

    "card4_freq":
        "card4",

    "card6_freq":
        "card6",

    "DeviceType_freq":
        "DeviceType",

    "P_emaildomain_freq":
        "P_emaildomain",

    "R_emaildomain_freq":
        "R_emaildomain",

    "device_key_freq":
        "device_key",

    "email_key_freq":
        "email_key",

    "addr_key_freq":
        "addr_key",
}


# ------------------------------------------------------------
# Frozen calibration
# ------------------------------------------------------------

with open(
    CALIBRATION_PATH,
    "r",
    encoding="utf-8"
) as _f:

    _calibration_payload = (
        _research_v2_json.load(_f)
    )

assert (
    _calibration_payload["method"]
    == "sigmoid_logit_calibration"
)

CAL_INTERCEPT = float(
    _calibration_payload["intercept"]
)

CAL_COEF = float(
    _calibration_payload["coef"]
)


# ------------------------------------------------------------
# Frozen policy
# ------------------------------------------------------------

REVIEW_THRESHOLD = 0.55
HIGH_THRESHOLD = 0.85


# ------------------------------------------------------------
# Frozen LightGBM model
# ------------------------------------------------------------

MODEL = _research_v2_lgb.Booster(
    model_file=MODEL_PATH
)

assert MODEL.num_trees() == 860

research_v2_model = MODEL

