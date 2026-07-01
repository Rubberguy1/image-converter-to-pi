"""Abstract matrix display interface.

Anything that can show a full-panel RGB frame implements this. Both the real
hardware driver and the emulator driver satisfy it, so the rest of the app never
imports a hardware-specific module.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from PIL import Image


class MatrixDisplay(ABC):
    width: int
    height: int
    backend: str  # "hardware" | "emulator" — for status reporting

    @abstractmethod
    def set_image(self, image: Image.Image) -> None:
        """Render a single RGB frame. Caller guarantees it is already sized
        width×height and in RGB mode."""

    @abstractmethod
    def set_brightness(self, brightness: int) -> None:
        """Set panel brightness, 0-100."""

    @abstractmethod
    def get_brightness(self) -> int: ...

    @abstractmethod
    def clear(self) -> None:
        """Blank the panel."""

    def close(self) -> None:  # optional override
        self.clear()
