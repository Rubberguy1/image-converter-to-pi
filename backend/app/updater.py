"""Self-update: report the running version, check the git remote for updates, and
apply them by running deploy/update.sh — launched in a DETACHED scope so it
survives the service restart it triggers."""
from __future__ import annotations

import logging
import shutil
import subprocess
import time

from .config import BASE_DIR

log = logging.getLogger(__name__)

REPO_DIR = BASE_DIR.parent            # repo root (backend/..)
UPDATE_SCRIPT = REPO_DIR / "deploy" / "update.sh"

# Short TTL, not permanent: a frontend-only update moves HEAD without restarting
# the backend, so the reported version must still refresh.
_version_cache: dict | None = None
_version_at = 0.0
_VERSION_TTL = 8.0


def _git(*args, timeout: int = 20) -> subprocess.CompletedProcess:
    # -c safe.directory=... so git doesn't refuse with "dubious ownership" when
    # the service runs as root but the repo is owned by the login user.
    return subprocess.run(
        ["git", "-C", str(REPO_DIR), "-c", f"safe.directory={REPO_DIR}", *args],
        capture_output=True, text=True, timeout=timeout,
    )


def is_git_repo() -> bool:
    return (REPO_DIR / ".git").exists()


def current() -> dict:
    """The repo's current version (cheap; cached for a few seconds)."""
    global _version_cache, _version_at
    now = time.monotonic()
    if _version_cache is not None and now - _version_at < _VERSION_TTL:
        return _version_cache
    if not is_git_repo():
        _version_cache = {"git": False, "version": "unknown"}
    else:
        try:
            _version_cache = {
                "git": True,
                "version": _git("rev-parse", "--short", "HEAD").stdout.strip() or "unknown",
                "message": _git("log", "-1", "--pretty=%s").stdout.strip(),
                "branch": _git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip(),
            }
        except Exception as exc:
            log.debug("version lookup failed: %s", exc)
            _version_cache = {"git": is_git_repo(), "version": "unknown"}
    _version_at = now
    return _version_cache


def check() -> dict:
    """Fetch the remote and report whether an update is available."""
    info = dict(current())
    if not info.get("git"):
        return {**info, "available": False, "error": "not a git checkout"}
    try:
        fetch = _git("fetch", "--quiet", timeout=45)
        if fetch.returncode != 0:
            return {**info, "available": False, "error": (fetch.stderr.strip() or "fetch failed")[:200]}
        behind = _git("rev-list", "--count", "HEAD..@{u}")
        n = int(behind.stdout.strip() or "0") if behind.returncode == 0 else 0
        changes = []
        if n > 0:
            out = _git("log", "--pretty=%h %s", "-n", "20", "HEAD..@{u}")
            changes = [line for line in out.stdout.splitlines() if line]
        return {**info, "available": n > 0, "behind": n, "changes": changes}
    except Exception as exc:
        return {**info, "available": False, "error": str(exc)[:200]}


def run() -> dict:
    """Kick off deploy/update.sh detached from this service, so the update
    survives the `systemctl restart` it performs."""
    if not is_git_repo():
        raise RuntimeError("not a git checkout — can't self-update")
    if not UPDATE_SCRIPT.exists():
        raise RuntimeError("deploy/update.sh missing")

    if shutil.which("systemd-run"):
        # Transient unit outside this service's cgroup — unaffected by the restart.
        cmd = ["systemd-run", "--collect", "bash", str(UPDATE_SCRIPT)]
    elif shutil.which("setsid"):
        cmd = ["setsid", "bash", str(UPDATE_SCRIPT)]
    else:
        cmd = ["bash", str(UPDATE_SCRIPT)]

    subprocess.Popen(
        cmd,
        cwd=str(REPO_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    log.info("self-update started via %s", cmd[0])
    return {"started": True}
