import asyncio
import time
import httpx
import numpy as np
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("benchmark")

async def send_request(client: httpx.AsyncClient, url: str, payload: dict):
    t0 = time.perf_counter()
    try:
        resp = await client.post(url, json=payload, timeout=10.0)
        latency = (time.perf_counter() - t0) * 1000.0
        return resp.status_code == 200, latency
    except Exception:
        return False, 0.0

async def main():
    parser = argparse.Argument_parser(description="Benchmark FastAPI inference latency")
    parser.add_argument("--url", type=str, default="http://localhost:8000/v1/predict")
    parser.add_argument("--concurrency", type=int, default=20)
    parser.add_argument("--requests", type=int, default=500)
    args = parser.parse_args()

    payload = {
        "user_id": "user_00042",
        "merchant_id": "merchant_0005",
        "device_id": "device_00012",
        "amount": 185.50,
        "category_code": 4,
        "distance_from_home_km": 12.5,
        "device_risk_score": 0.15,
        "hour": 14,
        "is_weekend": 0,
    }

    logger.info(f"Starting benchmark: {args.requests} requests, concurrency={args.concurrency}...")
    
    async with httpx.AsyncClient(limits=httpx.Limits(max_connections=args.concurrency)) as client:
        tasks = [send_request(client, args.url, payload) for _ in range(args.requests)]
        t_start = time.perf_counter()
        results = await asyncio.gather(*tasks)
        t_total = time.perf_counter() - t_start

    successes = [lat for ok, lat in results if ok]
    if not successes:
        logger.error("All requests failed. Is the FastAPI server running?")
        return

    p50 = float(np.percentile(successes, 50))
    p90 = float(np.percentile(successes, 90))
    p95 = float(np.percentile(successes, 95))
    p99 = float(np.percentile(successes, 99))
    rps = len(successes) / t_total

    logger.info("=== Benchmark Results ===")
    logger.info(f"Successful Requests: {len(successes)} / {args.requests}")
    logger.info(f"Throughput:         {rps:.1f} requests/sec")
    logger.info(f"p50 Latency:         {p50:.2f} ms")
    logger.info(f"p90 Latency:         {p90:.2f} ms")
    logger.info(f"p95 Latency:         {p95:.2f} ms")
    logger.info(f"p99 Latency:         {p99:.2f} ms")

if __name__ == "__main__":
    asyncio.run(main())
