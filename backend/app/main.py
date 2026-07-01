"""FastAPI application entrypoint.

Builds the matrix driver, playback engine, media library and music poller at
startup, exposes the JSON API under /api, and (in production) serves the built
React frontend so the whole thing is reachable at http://<pi>:8000/.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

# On Windows the default Proactor event loop trips an assertion when libraries
# (e.g. the emulator's browser view) start a Tornado server in a thread. The
# selector loop avoids it and is fine for this app. No-op on the Pi (Linux).
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

from . import settings_store
from .api import router as api_router
from .config import FRONTEND_DIST, settings
from .display import Player
from .integrations import WledSync
from .library import LibraryStore
from .matrix import create_matrix
from .music import MusicPoller

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("pixelpusher")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Apply any UI-saved credentials over the env defaults before pollers start.
    settings_store.load_and_apply()
    matrix = create_matrix()
    player = Player(matrix)
    player.start()
    library = LibraryStore()
    poller = MusicPoller(player, settings)
    await poller.start()
    wled = WledSync(player, settings)
    await wled.start()

    app.state.matrix = matrix
    app.state.player = player
    app.state.library = library
    app.state.poller = poller
    app.state.wled = wled
    log.info("Pixel Pusher ready (matrix backend=%s)", matrix.backend)

    try:
        yield
    finally:
        await wled.stop()
        await poller.stop()
        player.shutdown()
        log.info("Pixel Pusher shut down")


app = FastAPI(title="Pixel Pusher", version="1.0.0", lifespan=lifespan)

# Permissive CORS so the Vite dev server (different port) can call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/healthz")
async def healthz():
    return {"ok": True}


# Serve the built React app in production. During local dev the frontend runs on
# the Vite server instead, so this block is simply skipped when dist/ is absent.
if FRONTEND_DIST.exists():
    index_file = FRONTEND_DIST / "index.html"

    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="assets",
    )

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        # Serve real files if present, otherwise fall back to index.html so
        # client-side routing works.
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_file)
else:
    @app.get("/")
    async def dev_root():
        return {
            "service": "Pixel Pusher",
            "note": "Frontend not built. Run the Vite dev server, or build it "
                    "into frontend/dist for production serving.",
            "api": "/api/status",
        }
