FROM python:3.13.15-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /content/drive/MyDrive/razorpay_fraud_data/deployment/research_v2_api

RUN mkdir -p \
    /content/drive/MyDrive/razorpay_fraud_data/models \
    /content/drive/MyDrive/razorpay_fraud_data/deployment/research_v2_api \
    /opt/v2fraudgent-source

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements-pinned.txt /tmp/requirements-pinned.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install -r /tmp/requirements-pinned.txt

# Keep validated application source outside the persistent runtime volume.
# The entrypoint copies the current source into the runtime directory on each start,
# while persistent pickle state remains in the mounted runtime volume.
COPY backend/app.py /opt/v2fraudgent-source/app.py
COPY backend/research_v2_runtime.py /opt/v2fraudgent-source/research_v2_runtime.py
COPY backend/entrypoint.sh /usr/local/bin/v2fraudgent-entrypoint
RUN chmod +x /usr/local/bin/v2fraudgent-entrypoint

# Frozen configuration artifacts. The 860-tree model is intentionally NOT
# copied into the image; it must be supplied separately at runtime.
COPY backend/config/research_v2_feature_schema_recovered.json /content/drive/MyDrive/razorpay_fraud_data/models/research_v2_feature_schema_recovered.json
COPY backend/config/research_v2_frequency_maps.json /content/drive/MyDrive/razorpay_fraud_data/models/research_v2_frequency_maps.json
COPY backend/config/research_v2_calibrator.json /content/drive/MyDrive/razorpay_fraud_data/models/research_v2_calibrator.json

EXPOSE 8012

# Named/bind-mounted runtime storage keeps Research V2 state, processed events,
# and decision audit records across container replacement.
VOLUME ["/content/drive/MyDrive/razorpay_fraud_data/deployment/research_v2_api"]

ENTRYPOINT ["/usr/local/bin/v2fraudgent-entrypoint"]
