.PHONY: install data etl train drift benchmark test pipeline api

install:
	pip install -r requirements.txt
	pip install -e .

data:
	python scripts/generate_synthetic_data.py --num-transactions 50000

etl:
	python scripts/run_spark_etl.py

train:
	python scripts/train_model.py --tune --tune-trials 10

drift:
	python scripts/evaluate_drift.py

benchmark:
	python scripts/run_benchmark.py --requests 500 --concurrency 20

test:
	pytest tests/ -v

pipeline:
	python scripts/run_pipeline.py

api:
	uvicorn src.api.app:app --reload --port 8000
