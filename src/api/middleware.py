import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import logging

logger = logging.getLogger("src.api.middleware")


class PrometheusMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        t0 = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        logger.debug(f"{request.method} {request.url.path} -> {response.status_code} [{elapsed_ms:.2f}ms]")
        response.headers["X-Process-Time-Ms"] = str(round(elapsed_ms, 2))
        return response
