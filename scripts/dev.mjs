#!/usr/bin/env node
// One-command local dev: starts the FastAPI backend (in emulator mode) and the
// Vite frontend together, with prefixed output and clean Ctrl-C shutdown.
//
// Usage (from repo root):
//   node scripts/dev.mjs            # both
//   node scripts/dev.mjs backend    # backend only
//   node scripts/dev.mjs frontend   # frontend only
//
// The individual pieces still run standalone the usual way (see README).

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = join(ROOT, "backend");
const FRONTEND = join(ROOT, "frontend");
const isWin = process.platform === "win32";

const C = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const which = process.argv[2] || "all";
const runBackend = which === "all" || which === "backend";
const runFrontend = which === "all" || which === "frontend";
const children = [];

function fail(msg) {
  console.error(C.red("✗ " + msg));
  process.exit(1);
}

// Pipe a child's output through a colored [name] prefix, line by line.
function prefix(child, name, color) {
  const tag = color(`[${name}] `);
  for (const stream of [child.stdout, child.stderr]) {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        process.stdout.write(tag + buf.slice(0, nl) + "\n");
        buf = buf.slice(nl + 1);
      }
    });
  }
}

function startBackend() {
  const py = isWin
    ? join(BACKEND, ".venv", "Scripts", "python.exe")
    : join(BACKEND, ".venv", "bin", "python");
  if (!existsSync(py)) {
    fail(
      "backend virtualenv not found. Create it first:\n" +
        "  cd backend\n" +
        (isWin
          ? "  python -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt"
          : "  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt")
    );
  }
  console.log(C.dim(`▶ backend  (emulator) → http://localhost:8000  panel → http://localhost:8888`));
  const child = spawn(
    py,
    ["-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000", "--loop", "asyncio"],
    {
      cwd: BACKEND,
      env: { ...process.env, MATRIX_BACKEND: process.env.MATRIX_BACKEND || "emulator", PYTHONUNBUFFERED: "1" },
    }
  );
  prefix(child, "backend", C.cyan);
  return child;
}

function startFrontend() {
  if (!existsSync(join(FRONTEND, "node_modules"))) {
    console.log(C.dim("▶ frontend deps missing — running npm install…"));
    const res = spawnSync("npm", ["install"], { cwd: FRONTEND, stdio: "inherit", shell: true });
    if (res.status !== 0) fail("npm install failed in frontend/");
  }
  console.log(C.dim("▶ frontend (Vite dev server)"));
  const child = spawn("npm", ["run", "dev"], { cwd: FRONTEND, shell: true });
  prefix(child, "frontend", C.magenta);
  return child;
}

if (runBackend) children.push(startBackend());
if (runFrontend) children.push(startFrontend());

// If any child exits, tear everything down.
for (const child of children) {
  child.on("exit", (code) => {
    console.log(C.dim(`\n· a process exited (${code ?? "signal"}), shutting down…`));
    shutdown();
  });
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
