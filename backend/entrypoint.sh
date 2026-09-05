#!/bin/sh
set -eu

SOURCE_DIR="/opt/v2fraudgent-source"
RUNTIME_DIR="/content/drive/MyDrive/razorpay_fraud_data/deployment/research_v2_api"

mkdir -p "$RUNTIME_DIR"

# Refresh application source on every container start while preserving
# persistent runtime state files stored in the mounted runtime volume.
cp "$SOURCE_DIR/app.py" "$RUNTIME_DIR/app.py"
cp "$SOURCE_DIR/research_v2_runtime.py" "$RUNTIME_DIR/research_v2_runtime.py"

exec uvicorn app:app --host 0.0.0.0 --port 8012
