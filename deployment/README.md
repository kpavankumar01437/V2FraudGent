# V2FraudGent production deployment

This deployment bundle keeps the validated Research V2 scoring runtime unchanged while adding the operational boundary needed around it.

## Architecture

```text
Browser
  -> Caddy HTTPS + Basic Auth
      -> /api/* -> V2FraudGent FastAPI
      -> /razorpay/webhook -> V2FraudGent FastAPI (no dashboard auth)
      -> /health -> V2FraudGent FastAPI
      -> static Console frontend

FastAPI
  -> canonical Research V2 runtime
  -> persistent runtime volume

Razorpay webhook
  -> raw-body HMAC verification
  -> duplicate protection
  -> chronological guard
  -> Research V2 scoring/calibration/evidence
  -> state + decision audit persistence
```

## Required deployment inputs

1. Supply the frozen Research V2 model locally at `models/fraud_lgbm_research_v2_65_15_20.txt`. It is intentionally not committed to Git.
2. Set the variables from `env.production.example` in the deployment environment. Never commit the real webhook secret or dashboard password.
3. Set `V2FRAUDGENT_DOMAIN` to the public HTTPS hostname before internet deployment. `:80` is suitable only for local HTTP testing.
4. Use durable Docker volumes for `v2fraudgent_runtime`, `caddy_data`, and `caddy_config`.

## Local production-style smoke test

Copy `env.production.example` to a local environment file, replace the placeholder values, then run the compose file from the `deployment` directory.

The console is served by Caddy. The backend is not directly exposed to the host network; Caddy is the public entry point.

## HTTPS / Razorpay

For a real Razorpay webhook, configure the Razorpay dashboard to call:

`https://YOUR_DOMAIN/razorpay/webhook`

Caddy can provision the TLS certificate when the domain points to this deployment. Keep the Razorpay webhook secret only in the backend deployment environment.

## Persistence

The backend runtime directory is a persistent Docker volume. The validated state files and the decision audit file therefore survive container replacement when the same named volume is retained.

## Security boundary

The Console and `/api/*` are protected by HTTP Basic Auth at Caddy. `/razorpay/webhook` is deliberately outside that browser-auth boundary because Razorpay must be able to deliver signed webhook events directly. `/health` remains public for health probes.

Do not expose the FastAPI port directly to the internet in production.
