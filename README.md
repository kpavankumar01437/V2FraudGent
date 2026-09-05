# V2FraudGent

V2FraudGent is a chronological fraud-risk scoring platform built around the Research V2 fraud engine.

## Product components

- **Research V2** — chronological transaction feature engineering, model inference, calibration, and evidence generation.
- **V2FraudGent API** — webhook-driven scoring API for payment events.
- **V2FraudGent Console** — browser dashboard for live connection status, recent Research V2 decisions, review filtering, transaction details, search, and model/policy inspection.

## Current status

The Research V2 inference pipeline has been validated for:

- Frozen 92-feature model schema
- Chronological stateful scoring
- Probability calibration
- Duplicate-event handling
- HMAC verification for Razorpay webhooks
- Restart persistence
- Concurrency and failure isolation
- Production observability checks
- Live decision audit feed used by the Console

The Console currently connects to the API through `/health` and `/api/transactions`. Review queue filtering, transaction-detail inspection, live-search, and model/policy details are handled in the browser without creating a second fraud-scoring path.

## Security

Never commit API keys, webhook secrets, model binaries, serialized state, customer data, or payment payloads containing personal information. Configure secrets through environment variables or the deployment platform's secret manager.

The public deployment must also protect the transaction-audit endpoint with an authenticated application boundary and place the Research V2 state/audit files on durable storage.

## Planned structure

```text
V2FraudGent/
├── backend/
├── fraud_engine/
├── frontend/
├── tests/
├── deployment/
├── docs/
└── .github/
```

## Disclaimer

V2FraudGent is a fraud-risk decision-support system. Its scores are not definitive proof of fraud and must be used with appropriate operational controls, review procedures, and compliance requirements.
