
# V2FraudGent

<p align="center">
  <strong>Chronological Fraud-Risk Intelligence for Payment Events</strong>
</p>

<p align="center">
  A full-stack fraud-risk decision-support system that turns signed Razorpay payment events into chronological, calibrated, evidence-backed risk decisions and exposes them through an operational web console.
</p>

<p align="center">
  <a href="https://github.com/kpavankumar01437/V2FraudGent">
    <img src="https://img.shields.io/badge/GitHub-V2FraudGent-181717?style=for-the-badge&logo=github" alt="GitHub">
  </a>
  <img src="https://img.shields.io/badge/Python-3.x-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-API-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/LightGBM-ML-2E8B57?style=for-the-badge" alt="LightGBM">
  <img src="https://img.shields.io/badge/Razorpay-Payments-528FF0?style=for-the-badge" alt="Razorpay">
  <img src="https://img.shields.io/badge/Docker-Deployment-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/github/actions/workflow/status/kpavankumar01437/V2FraudGent/verify.yml?branch=main&style=for-the-badge&label=verification" alt="Verification workflow">
</p>

---

## Why V2FraudGent?

Most payment-fraud demos stop at:

~~~text
transaction → model → score
~~~

V2FraudGent is built around a more operational workflow:

~~~text
signed payment event
        ↓
webhook verification
        ↓
event validation + duplicate protection
        ↓
payment → Research V2 representation
        ↓
chronological state lookup
        ↓
frozen 92-feature inference
        ↓
probability calibration
        ↓
risk policy
        ↓
interpretable evidence
        ↓
persistent state + decision audit
        ↓
browser console
~~~

The result is a system that demonstrates not only machine-learning inference, but also the surrounding engineering required to make a fraud-risk pipeline safer, repeatable, observable, and operationally useful.

---

## Project at a glance

| Layer | Implementation |
|---|---|
| Payment integration | Razorpay Checkout + signed webhooks |
| API | FastAPI |
| Fraud engine | Research V2 runtime |
| Model | 860-tree LightGBM model |
| Feature contract | Frozen 92-feature schema |
| Calibration | Frozen sigmoid-logit calibration |
| State | Chronological entity history |
| Risk policy | LOW / MEDIUM / HIGH |
| Evidence | Transaction-side reason codes |
| Frontend | HTML, CSS, JavaScript |
| Deployment | Docker Compose + Caddy |
| Verification | GitHub Actions |

---

## Core capabilities

### 1. Chronological fraud scoring

The Research V2 runtime is stateful. It uses information from transactions already seen before the current transaction to construct temporal and entity-history features.

The runtime tracks histories for entities such as:

- Cards
- Devices
- Email domains
- Addresses
- Card ↔ device relationships
- Card ↔ email relationships
- Card ↔ address relationships
- Transaction timestamps

It also derives velocity features over windows such as **1 hour** and **24 hours**, together with historical amount baselines and deviation signals.

### 2. Frozen model contract

The deployment loads a fixed Research V2 feature schema and asserts that it contains exactly **92 model features**.

The repository keeps the feature construction logic separate from the API layer, which helps preserve a single canonical scoring path.

### 3. LightGBM inference + calibration

The frozen deployment uses an **860-tree LightGBM model**.

The scoring sequence is:

~~~text
raw model probability
        ↓
sigmoid-logit calibration
        ↓
calibrated risk score
~~~

The calibrated score is then evaluated against the configured policy thresholds:

- **< 0.55** → LOW
- **0.55–< 0.85** → MEDIUM
- **≥ 0.85** → HIGH

The corresponding recommended actions are:

- LOW → <code>ALLOW_MONITOR</code>
- MEDIUM → <code>REVIEW</code>
- HIGH → <code>HOLD_INVESTIGATE</code>

These are decision-support actions, not proof that a transaction is fraudulent.

### 4. Webhook security

Razorpay webhook requests are validated using an **HMAC-SHA256 signature** over the raw request body.

The application also expects the Razorpay event identifier and maintains a processed-event registry to prevent duplicate handling.

### 5. Chronological safety

The scoring path is deliberately ordered:

~~~text
pre-transaction state
        ↓
feature construction
        ↓
model inference
        ↓
calibration
        ↓
evidence generation
        ↓
state update
~~~

The state is updated **after** the current transaction has been scored. This prevents the current transaction from leaking its own information into the features used to score it.

### 6. Evidence generation

The runtime produces transaction-side evidence alongside the score.

Current reason-code examples include:

| Code | Signal |
|---|---|
| R01 | Established card + unseen device |
| R02 | Established identity with behavioral takeover signal |
| R03 | Transaction amount >2× historical card baseline |
| R04 | Transaction amount >2× historical device baseline |
| R06 | Established identity with behavioral takeover proxy |

These signals are designed for review and investigation. They are not standalone proof of fraud.

### 7. Live fraud console

The frontend acts as an operational console for the API.

It currently supports:

- API connection / health status
- Research V2 model information
- Decision metrics
- Review queue
- Risk filtering
- Transaction search
- Transaction detail inspection
- Recent decision audit feed
- Time-based decision charting
- Test payments through Razorpay Checkout

The frontend consumes the canonical API decision feed rather than implementing a second browser-side fraud-scoring path.

---

## Architecture

~~~mermaid
flowchart TD
    A[Razorpay Checkout / Payment Event] --> B[Razorpay Webhook]
    B --> C[FastAPI Webhook Handler]
    C --> D[HMAC-SHA256 Verification]
    D --> E[Event Validation]
    E --> F[Duplicate Event Protection]
    F --> G[Payment → Research V2 Adapter]
    G --> H[Chronological Guard]
    H --> I[Research V2 Feature Builder]
    I --> J[92-Feature Frozen Schema]
    J --> K[860-Tree LightGBM]
    K --> L[Sigmoid-Logit Calibration]
    L --> M[Risk Policy]
    M --> N[Reason / Evidence Generation]
    N --> O[Persistent State]
    N --> P[Decision Audit]
    P --> Q[V2FraudGent Console]
    Q --> R[Search / Review / Metrics / Details]
~~~

---

## Transaction lifecycle

A payment event passes through the following lifecycle:

~~~text
1. Receive signed Razorpay webhook
2. Read the raw request body
3. Verify the webhook HMAC signature
4. Validate the event identifier and payload
5. Reject already-processed events
6. Extract the payment entity
7. Map defensibly available payment fields into the Research V2 input space
8. Check chronological ordering
9. Build pre-transaction state + frequency + static features
10. Produce the frozen 92-feature vector
11. Run the frozen LightGBM model
12. Calibrate the raw probability
13. Classify the risk zone
14. Generate transaction-side evidence
15. Update chronological state
16. Persist the decision
17. Expose the decision through the API
18. Render it in the console
~~~

---

## Research V2 engine

The research runtime combines static transaction information with state accumulated from previously scored transactions.

### State-derived signals

Examples include:

- Historical transaction counts
- Historical transaction amounts
- Historical average amounts
- Amount-to-baseline ratios
- 1-hour velocity
- 24-hour velocity
- Card/device relationship history
- Card/email relationship history
- Card/address relationship history
- New-device signals
- Identity-break signals
- Amount deviation signals
- Frequency features
- Missing-feature count

A simplified representation is:

~~~text
Current transaction
        +
Historical entity state
        +
Frequency mappings
        ↓
Research V2 feature vector
        ↓
LightGBM inference
        ↓
Calibrated risk
~~~

### Model boundary

The project treats the Research V2 runtime as the canonical source of truth for scoring.

That means the API and console are orchestration/presentation layers around the model runtime rather than independent implementations of fraud logic.

---

## Defensible payment-data mapping

The Razorpay adapter intentionally avoids inventing information that is not available in the incoming payment payload.

For example:

- Available payment fields are mapped where the mapping is defensible.
- Unsupported fields remain missing rather than being assigned fabricated identifiers.
- Numeric model fields are not filled using arbitrary hashes or synthetic encodings.

This is an important design choice: **missing source data is preferable to silently introducing fake model semantics.**

---

## Risk policy

The current policy is intentionally simple and transparent:

| Calibrated score | Risk zone | Recommended action |
|---:|---|---|
| < 0.55 | LOW | <code>ALLOW_MONITOR</code> |
| 0.55 – < 0.85 | MEDIUM | <code>REVIEW</code> |
| ≥ 0.85 | HIGH | <code>HOLD_INVESTIGATE</code> |

The system exposes both the raw model probability and the calibrated risk score so that the decision record remains traceable.

---

## API

### Health

~~~http
GET /health
~~~

Returns runtime information such as:

- API status
- Model name
- Model version
- Feature count
- Number of LightGBM trees
- Review threshold
- High-risk threshold
- Runtime state type

### Transactions

~~~http
GET /api/transactions?limit=50
~~~

Returns recent persisted fraud decisions for the console.

The endpoint currently caps the requested limit at **200**.

### Create demo order

~~~http
POST /api/create-order
Content-Type: application/json
~~~

Example body:

~~~json
{
  "amount_paise": 50000,
  "currency": "INR"
}
~~~

This creates an INR Razorpay order for the demo payment flow.

### Razorpay webhook

~~~http
POST /razorpay/webhook
~~~

This is the main event-ingestion boundary for payment notifications.

The webhook path verifies the Razorpay signature before the event reaches the scoring pipeline.

---

## Repository structure

~~~text
V2FraudGent/
├── backend/
│   ├── app.py
│   ├── research_v2_runtime.py
│   ├── config/
│   │   ├── research_v2_calibrator.json
│   │   ├── research_v2_feature_schema_recovered.json
│   │   └── research_v2_frequency_maps.json
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── requirements.txt
│   └── requirements-pinned.txt
│
├── frontend/
│   ├── index.html
│   ├── app.js
│   ├── config.js
│   └── styles.css
│
├── deployment/
│   ├── Caddyfile
│   ├── docker-compose.production.yml
│   ├── env.production.example
│   └── README.md
│
├── .github/
│   └── workflows/
│       └── verify.yml
│
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
~~~

---

## Technology stack

### Backend

- Python
- FastAPI
- Uvicorn
- NumPy
- Pandas
- SciPy

### Machine learning

- LightGBM
- Frozen Research V2 feature schema
- Frozen frequency maps
- Sigmoid-logit probability calibration
- Stateful chronological feature engineering

### Payments

- Razorpay Checkout
- Razorpay webhooks
- HMAC-SHA256 webhook verification

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- SVG-based data visualization

### Deployment

- Docker
- Docker Compose
- Caddy
- Persistent Docker volumes
- HTTP Basic Auth at the deployment boundary

### Engineering / verification

- Git
- GitHub Actions
- Python syntax checks
- JavaScript syntax checks
- Shell syntax checks
- Docker Compose configuration validation

---

## Running the project

### Prerequisites

Install:

- Python
- Node.js
- Docker (for production-style deployment)
- Razorpay test-mode credentials for the payment flow

### Backend dependencies

From the repository root:

~~~bash
pip install -r backend/requirements.txt
~~~

### Frontend

The frontend is a static browser application.

For local testing, serve the <code>frontend/</code> directory with a static HTTP server rather than opening <code>index.html</code> directly.

Example:

~~~bash
cd frontend
python -m http.server 5500
~~~

### Backend runtime artifacts

The validated Research V2 runtime intentionally does **not** commit the model binary or live persistent state to Git.

The deployment expects external Research V2 artifacts, including:

~~~text
fraud_lgbm_research_v2_65_15_20.txt
research_v2_feature_schema_recovered.json
research_v2_frequency_maps.json
research_v2_calibrator.json
~~~

The current backend source also contains deployment-specific artifact paths. Before running the backend outside that deployment environment, configure those paths for the environment where the artifacts are stored.

### Environment variables

Use the provided examples as the starting point:

~~~text
.env.example
deployment/env.production.example
~~~

Secrets such as Razorpay credentials, webhook secrets, and dashboard credentials should be provided through the environment or deployment secret manager.

---

## Production-style deployment

The repository includes a Docker/Caddy deployment bundle.

The intended boundary is:

~~~text
Internet
   ↓
Caddy HTTPS
   ├── authenticated dashboard/API
   ├── public /health
   └── signed Razorpay webhook
              ↓
          FastAPI
              ↓
       Research V2 runtime
              ↓
       persistent state
~~~

### Important deployment properties

- FastAPI is not intended to be directly exposed to the public internet.
- Caddy provides the external HTTP/HTTPS boundary.
- Browser-facing dashboard and API access are protected by the configured authentication layer.
- The Razorpay webhook remains outside the browser-auth boundary so Razorpay can deliver signed events.
- Research state and decision history should live on durable storage.
- The webhook secret and dashboard password must never be committed to Git.

See [<code>deployment/README.md</code>](deployment/README.md) for the deployment-specific configuration.

---

## CI verification

The repository includes a GitHub Actions workflow that runs on pushes and pull requests to <code>main</code>.

The current checks include:

~~~text
Python
  └─ py_compile backend/app.py backend/research_v2_runtime.py

Frontend
  └─ node --check frontend/app.js

Shell
  └─ bash -n backend/entrypoint.sh

Deployment
  └─ docker compose ... config
~~~

The goal is to catch basic source and deployment-configuration regressions automatically.

---

## Security and operational considerations

V2FraudGent is designed as a fraud-risk **decision-support** system, not an autonomous declaration of fraud.

Do not commit:

- API keys
- webhook secrets
- model binaries
- serialized runtime state
- customer data
- payment payloads containing personal information
- production authentication credentials

For production use, the surrounding system should also provide appropriate:

- Authentication and authorization
- Audit controls
- Data-retention policies
- Monitoring and alerting
- Durable persistence
- Compliance and privacy controls
- Human review procedures

---

## Current implementation

The repository currently contains the following implemented surfaces:

**Research V2**
- Chronological stateful scoring
- 92-feature frozen schema
- LightGBM inference
- Sigmoid-logit calibration
- Risk policy
- Evidence generation

**Razorpay integration**
- INR order creation
- Razorpay Checkout test flow
- Signed webhook verification
- Duplicate-event handling

**Console**
- Live API status
- Metrics
- Review queue
- Search and filtering
- Transaction inspection
- Decision feed
- Risk visualization
- Model/policy inspection

**Deployment**
- Docker packaging
- Docker Compose
- Caddy configuration
- Persistent runtime volume design
- Authenticated dashboard boundary

**Verification**
- GitHub Actions checks for Python, JavaScript, shell, and Compose configuration

---

## Engineering decisions

### One canonical scoring path

The frontend does not recreate the fraud model logic. Decisions are produced by the Research V2 runtime and then exposed through the API.

### State updates happen after scoring

The current transaction is scored against pre-transaction state. Only after inference and evidence generation is the state updated.

### Duplicate events are controlled

The webhook layer tracks processed Razorpay event IDs so repeated delivery does not silently create repeated scoring decisions.

### Missing data is explicit

The Razorpay adapter does not fabricate unsupported identity or device values just to fill model fields.

### Production boundaries are explicit

The project separates the application runtime from the external deployment boundary, allowing HTTPS, authentication, persistence, and secret handling to be managed around the core API.

---

## Limitations

V2FraudGent should not be interpreted as a universal or production-certified fraud detector.

The current implementation has important constraints:

1. The Research V2 model depends on a frozen artifact set that is intentionally kept outside the public repository.
2. The Razorpay adapter can only populate features that can be defensibly derived from the payment event.
3. The current backend is deliberately conservative around chronological state and is not designed as a horizontally scaled multi-worker scoring engine.
4. Risk signals are proxies for transaction behavior and do not independently establish fraud.
5. Production deployment requires an appropriate data-security, compliance, monitoring, and human-review framework.

---

## Roadmap

Potential next engineering directions include:

- Database-backed state and audit storage
- Stronger role-based access control
- Formal model evaluation and monitoring
- Richer investigation workflows
- Provider-agnostic payment adapters
- Production-grade distributed state management
- Automated regression datasets for the scoring runtime
- Extended observability and alerting

---

## Who this project is for

V2FraudGent is useful as a reference project for engineers interested in:

- Fraud detection systems
- Applied machine learning
- Stateful / temporal feature engineering
- Payment webhooks
- Risk scoring
- Model calibration
- Explainable decision support
- FastAPI backend engineering
- Secure API design
- Full-stack engineering
- Docker-based deployment
- Production-oriented ML systems

---

## License

This project is distributed under the license included in [<code>LICENSE</code>](LICENSE).

---

## Author

**K Pavan Kumar**

GitHub: [@kpavankumar01437](https://github.com/kpavankumar01437)

Repository: [V2FraudGent](https://github.com/kpavankumar01437/V2FraudGent)

---

> **Disclaimer:** V2FraudGent provides fraud-risk decision support. Risk scores and evidence signals are not definitive proof of fraud and should be used with appropriate operational controls, review procedures, privacy protections, and compliance requirements.
