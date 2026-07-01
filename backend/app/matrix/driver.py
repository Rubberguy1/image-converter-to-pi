"""Matrix driver factory."""
from __future__ import annotations

import logging

from .base import MatrixDisplay

log = logging.getLogger(__name__)


def create_matrix() -> MatrixDisplay:
    from .rgb_driver import RGBMatrixDriver

    driver = RGBMatrixDriver()
    log.info("Matrix initialised: backend=%s size=%dx%d",
             driver.backend, driver.width, driver.height)
    return driver
