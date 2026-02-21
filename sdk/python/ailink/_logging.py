import logging

logger = logging.getLogger("ailink")

def log_request(method: str, url: str):
    logger.debug("AIlink SDK → %s %s", method, url)

def log_response(status: int, url: str, elapsed_ms: float):
    logger.debug("AIlink SDK ← %d %s (%.0fms)", status, url, elapsed_ms)
