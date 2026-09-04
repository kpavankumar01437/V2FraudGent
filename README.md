# V2FraudGent

V2FraudGent is a chronological fraud-risk scoring platform built around the Research V2 fraud engine.

## Product components

- **Research V2** — chronological transaction feature engineering, model inference, calibration, and evidence generation.
- **V2FraudGent API** — webhook-driven scoring API for payment events.
- **V2FraudGent Console** — planned dashboard for monitoring risk decisions, evidence, and operational outcomes.

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

## Security

Never commit API keys, webhook secrets, model binaries, serialized state, customer data, or payment payloads containing personal information. Configure secrets through environment variables or the deployment platform's secret manager.

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
