FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY feature_repo/ ./feature_repo/
COPY models/ ./models/
COPY data/ ./data/
COPY setup.py .
RUN pip install -e . --no-deps

EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn src.api.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
