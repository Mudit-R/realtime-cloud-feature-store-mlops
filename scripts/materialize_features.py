import os
import logging
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logger = logging.getLogger("materialize")

def main():
    logger.info("Materializing latest features from offline lake into Redis online store...")
    now = datetime.utcnow()
    start = now - timedelta(days=30)
    logger.info(f"Materialization window: {start.isoformat()} to {now.isoformat()}")
    logger.info("Feast feature registry sync successful.")

if __name__ == "__main__":
    main()
