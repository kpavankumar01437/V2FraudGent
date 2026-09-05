FROM python:3.13.15-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /content/drive/MyDrive/razorpay_fraud_data/deployment/research_v2_api

# Recreate the directory layout expected by the frozen Research V2 source.
RUN mkdir -p \
    /content/drive/MyDrive/razorpay_fraud_data/models \
    /content/drive/MyDrive/razorpay_fraud_data/deployment/research_v2_api
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements-pinned.txt /tmp/requirements-pinned.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install -r /tmp/requirements-pinned.txt

# Preserve the validated source files byte-for-byte.
COPY backend/app.py /content/drive/MyDrive/razorpay_fraud_data/deployment/research_v2_api/app.py
COPY backend/research_v2_runtime.py /content/drive/MyDrive/razorpay_fraud_data/deployment/research_v2_api/research_v2_runtime.py

# Frozen configuration artifacts. The 860-tree model is intentionally NOT
# copied into the image; it must be supplied separately at runtime.
COPY backend/config/research_v2_feature_schema_recovered.json /content/drive/MyDrive/razorpay_fraud_data/models/research_v2_feature_schema_recovered.json
COPY backend/config/research_v2_frequency_maps.json /content/drive/MyDrive/razorpay_fraud_data/models/research_v2_frequency_maps.json
COPY backend/config/research_v2_calibrator.json /content/drive/MyDrive/razorpay_fraud_data/models/research_v2_calibrator.json

EXPOSE 8012

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8012"]
