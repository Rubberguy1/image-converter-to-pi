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
import { existsSync, watch } from "node:fs";
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

// The backend (uvicorn on 8000) and the emulator's browser server (8888) are
// frequently orphaned by a previous run — especially on Windows, where a hard
// exit can leave the --reload worker or emulator alive holding the port. Kill
// whatever is on those ports before starting so `dev` always gets a clean slate.
const BACKEND_PORTS = [8000, 8888];

function pidsOnPort(port) {
  const pids = new Set();
  try {
    if (isWin) {
      const out = spawnSync("netstat", ["-ano"], { encoding: "utf8" }).stdout || "";
      for (const line of out.split("\n")) {
        if (!/LISTENING/i.test(line)) continue;
        const m = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      }
    } else {
      const out = spawnSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" }).stdout || "";
      for (const p of out.split(/\s+/)) if (p) pids.add(p);
    }
  } catch {
    /* netstat/lsof unavailable — nothing we can do, just proceed */
  }
  return [...pids];
}

function freeBackendPorts() {
  for (const port of BACKEND_PORTS) {
    for (const pid of pidsOnPort(port)) {
      if (String(pid) === String(process.pid) || pid === "0") continue;
      console.log(C.dim(`· killing existing backend service on port ${port} (PID ${pid})`));
      if (isWin) {
        spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
      } else {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }
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
  freeBackendPorts();
  // NOTE: no --reload by default. The emulator starts a Tornado server thread
  // and holds the matrix; uvicorn's in-place reload can't tear that down and
  // hangs the worker forever on the first backend edit. Restarting `npm run dev`
  // is clean (stale ports are killed above) and fast. Opt back in with
  // PP_BACKEND_RELOAD=1 if you're only touching pure-API code and accept the risk.
  const reload = process.env.PP_BACKEND_RELOAD === "1";
  const args = ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "asyncio"];
  if (reload) args.splice(3, 0, "--reload");
  console.log(
    C.dim(
      `▶ backend  (emulator${reload ? ", --reload" : ""}) → http://localhost:8000  panel → http://localhost:8888` +
        (reload ? "" : "  (edit backend? restart: Ctrl-C then npm run dev)")
    )
  );
  const child = spawn(py, args, {
    cwd: BACKEND,
    env: { ...process.env, MATRIX_BACKEND: process.env.MATRIX_BACKEND || "emulator", PYTHONUNBUFFERED: "1" },
  });
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

// Backend is tracked separately so we can restart just it on a .py change.
let backendChild = null;
let frontendChild = null;
let restartingBackend = false;

function attachExit(child, name) {
  child.on("exit", (code) => {
    if (shuttingDown) return;
    if (name === "backend" && restartingBackend) return; // expected during restart
    console.log(C.dim(`\n· ${name} exited (${code ?? "signal"}), shutting down…`));
    shutdown();
  });
}

if (runBackend) {
  backendChild = startBackend();
  attachExit(backendChild, "backend");
}
if (runFrontend) {
  frontendChild = startFrontend();
  attachExit(frontendChild, "frontend");
}

// Full kill+respawn of the backend on code changes. uvicorn's in-place --reload
// hangs because the emulator's server/threads can't tear down mid-process, so we
// restart the whole process instead (freeBackendPorts clears 8000/8888 first).
function restartBackend() {
  if (!backendChild || shuttingDown || restartingBackend) return;
  restartingBackend = true;
  console.log(C.cyan("\n↻ backend change — restarting…"));
  killTree(backendChild);
  setTimeout(() => {
    backendChild = startBackend();
    attachExit(backendChild, "backend");
    restartingBackend = false;
  }, 500);
}

function watchBackend() {
  const dir = join(BACKEND, "app");
  let timer = null;
  try {
    watch(dir, { recursive: true }, (_evt, file) => {
      if (!file || !String(file).endsWith(".py")) return;
      clearTimeout(timer);
      timer = setTimeout(restartBackend, 300);
    });
    console.log(C.dim("· watching backend/app for .py changes (auto-restart)"));
  } catch (e) {
    console.log(C.dim(`· backend watch unavailable (${e.message}); edit → restart manually`));
  }
}

if (runBackend) watchBackend();

function killTree(child) {
  if (!child || child.killed) return;
  try {
    if (isWin) {
      // On Windows child.kill() leaves grandchildren (uvicorn's --reload worker,
      // the emulator server) alive, orphaning ports 8000/8888. /T kills the tree.
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill();
    }
  } catch {
    /* already gone */
  }
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [backendChild, frontendChild]) killTree(child);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
