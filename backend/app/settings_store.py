"""Runtime, user-editable settings persisted to disk.

Credentials and connection details (Plex/VLC/Last.fm) can be set from the web UI
instead of hand-editing .env. Values are stored in data/settings.json and applied
onto the in-memory `settings` object at startup and whenever the user saves, so
the pollers pick them up on their next (re)configure.

Secrets (tokens/passwords) are never sent back to the browser — the public view
only reports whether each secret is set.
"""
from __future__ import annotations

import json
import logging
import threading

from .config import DATA_DIR, settings

log = logging.getLogger(__name__)

_PATH = DATA_DIR / "settings.json"
_lock = threading.Lock()

# attribute on `settings` -> is it a secret?
EDITABLE: dict[str, bool] = {
    # Panel geometry / hardware (see RESTART_FIELDS — these need a restart).
    "matrix_panels_wide": False,
    "matrix_panels_tall": False,
    "matrix_panel_cols": False,
    "matrix_panel_rows": False,
    "matrix_orientation": False,
    "matrix_panel_type": False,
    "matrix_gpio_slowdown": False,
    "matrix_hardware_mapping": False,
    "matrix_brightness": False,  # applies live
    # Music provider credentials.
    "plex_base_url": False,
    "plex_token": True,
    "vlc_base_url": False,
    "vlc_password": True,
    "lastfm_api_key": True,
    "lastfm_user": False,
    # WLED.
    "wled_base_url": False,
    "wled_sync_direction": False,
}
SECRETS = {k for k, secret in EDITABLE.items() if secret}

# Panel-hardware fields that only take effect after a restart (the matrix driver
# is created once at startup). Brightness is excluded — it applies live.
RESTART_FIELDS = {
    "matrix_panels_wide",
    "matrix_panels_tall",
    "matrix_panel_cols",
    "matrix_panel_rows",
    "matrix_orientation",
    "matrix_panel_type",
    "matrix_gpio_slowdown",
    "matrix_hardware_mapping",
}


def load_and_apply() -> None:
    """Apply persisted settings onto the global config object at startup."""
    if not _PATH.exists():
        return
    try:
        data = json.loads(_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        log.warning("could not read settings.json (%s); using env defaults", exc)
        return
    for key, value in data.items():
        if key in EDITABLE and value is not None:
            setattr(settings, key, value)


def _save_locked() -> None:
    data = {key: getattr(settings, key) for key in EDITABLE}
    tmp = _PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(_PATH)


def public_view() -> dict:
    """Current settings for the UI. Secret values are withheld; instead a
    `<field>_set` boolean reports whether one is configured."""
    out: dict = {}
    for key, is_secret in EDITABLE.items():
        value = getattr(settings, key)
        if is_secret:
            out[key] = ""
            out[f"{key}_set"] = bool(value)
        else:
            out[key] = value
    return out


def update(fields: dict) -> dict:
    """Apply a partial update. Non-secret fields are set when provided (not None);
    secret fields are only updated when a non-empty value is given, so leaving a
    password blank in the UI keeps the existing one."""
    with _lock:
        for key, value in fields.items():
            if key not in EDITABLE or value is None:
                continue
            if key in SECRETS and value == "":
                continue  # blank secret = leave unchanged
            setattr(settings, key, value)
        _save_locked()
    return public_view()
