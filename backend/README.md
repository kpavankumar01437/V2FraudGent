# V2FraudGent API

This directory is reserved for the exact validated Research V2 deployment source.

## Source of truth

The production fraud engine must remain the validated Research V2 implementation. Do not reimplement or approximate feature engineering, calibration, chronology, reason codes, or state handling in this repository.

The current validated deployment consists of:

- `app.py` — FastAPI webhook application, webhook verification, event handling, chronological guard, persistence, and API routes.
- `research_v2_runtime.py` — Research V2 feature construction, model inference, calibration, policy, evidence generation, and state update.

The validated runtime uses a 92-feature frozen schema and an 860-tree Research V2 LightGBM model. The transaction lifecycle is:

```text
incoming payment
    -> verify webhook signature
    -> validate event
    -> extract payment
    -> construct research row
    -> chronological guard
    -> score with Research V2
    -> calibrate
    -> generate evidence
    -> update chronological state
    -> persist state + processed event
```

The current deployment has already been tested for duplicate-event protection and chronological safety. An incoming transaction older than the latest scored transaction is deferred and the Research V2 state is not modified.

## Local development

The exact deployment source should be copied here before running the application locally:

```text
backend/
├── app.py
├── research_v2_runtime.py
├── research_v2_feature_schema_recovered.json
├── research_v2_frequency_maps.json
├── research_v2_calibrator.json
└── requirements.txt
```

The model file and persistent runtime state are deployment artifacts and must not be committed to Git.

## Frontend integration

The Console uses the backend health contract first:

```http
GET /health
```

Expected fields:

```json
{
  "status": "ok",
  "model": "research_v2",
  "model_version": "research_v2_65_15_20",
  "feature_count": 92,
  "model_trees": 860,
  "review_threshold": 0.55,
  "high_threshold": 0.85,
  "state_type": "ResearchV2State"
}
```

The browser must never contain the Razorpay webhook secret or any model credentials.

## Important

Do not add a browser-side `/score` implementation. Scoring must continue through the canonical Research V2 runtime so that the frontend cannot create a second, inconsistent fraud decision path.
