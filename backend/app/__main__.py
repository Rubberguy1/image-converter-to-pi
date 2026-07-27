"""Run the server: `python -m app` (from the backend/ directory).

Serves plain HTTP by default. If TLS_CERTFILE and TLS_KEYFILE are set (and the
files exist) it serves HTTPS instead — needed for the browser extension from
Firefox. See docs/HTTPS.md.
"""
from __future__ import annotations

import logging
import os

import uvicorn

from .config import settings

log = logging.getLogger("pixelpusher")

HOST = "0.0.0.0"
PORT = 8000


def main() -> None:
    kwargs = {"host": HOST, "port": PORT, "loop": "asyncio"}

    cert = settings.tls_certfile.strip()
    key = settings.tls_keyfile.strip()
    if cert and key:
        if os.path.isfile(cert) and os.path.isfile(key):
            kwargs["ssl_certfile"] = cert
            kwargs["ssl_keyfile"] = key
            log.info("Serving HTTPS on :%d (cert=%s)", PORT, cert)
        else:
            # Don't silently fall back to HTTP with a misleading URL — make the
            # misconfiguration obvious in the logs.
            log.error(
                "TLS configured but files missing (cert=%s key=%s); serving HTTP",
                cert, key,
            )

    uvicorn.run("app.main:app", **kwargs)


if __name__ == "__main__":
    main()
