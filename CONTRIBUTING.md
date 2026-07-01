# Contributing

Thanks for your interest in Pixel Pusher! Contributions are welcome.

## Development setup

You don't need a Raspberry Pi or a physical panel — the app ships with an emulator.

```bash
# Backend (any OS)
cd backend
python -m venv .venv
. .venv/Scripts/activate          # Windows; source .venv/bin/activate elsewhere
pip install -r requirements.txt
export MATRIX_BACKEND=emulator     # Windows: set MATRIX_BACKEND=emulator
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

The emulator renders a virtual panel in your browser (default `http://localhost:8888`).

## Project structure

- `backend/app/matrix/` — matrix driver abstraction (real hardware + emulator)
- `backend/app/imaging/` — image/GIF/disc rendering pipeline (Pillow)
- `backend/app/display/` — playback engine (frame loop, sleep/wake)
- `backend/app/library/` — media library store
- `backend/app/music/` — now-playing providers (Plex, VLC, Last.fm) + poller
- `backend/app/integrations/` — WLED power sync (and future integrations)
- `backend/app/api/` — FastAPI routes
- `frontend/src/` — React UI

## Guidelines

- Keep the matrix driver hardware-agnostic — new features should work against the
  emulator so they can be developed and reviewed without hardware.
- Match the surrounding code style; keep functions small and commented where the
  intent isn't obvious.
- Never commit secrets. `.env` is gitignored — use `.env.example` for new config
  keys (with safe placeholder values).
- New config options go in `app/config.py` **and** `.env.example`.

## Ideas & roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for planned work. Feel free to open an issue
to discuss a feature before starting on it.
