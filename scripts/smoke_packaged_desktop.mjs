/**
 * Launch a packaged SpikeForge Desktop build and prove its engine answers.
 *
 * The Electron suite under `tests/e2e/specs/electron/` launches the *source*
 * tree against a Python shim. That covers the supervision logic but never the
 * two things a user actually receives: the frozen backend binary and the
 * packaged resource layout. A build whose engine cannot start on the target
 * operating system therefore passes every check and still opens no window,
 * because `desktop/main.cjs` shows nothing until `/health` answers.
 *
 * This script closes that gap. It runs the real executable from a real
 * package, waits for the engine to report a port, and calls `/health` on it.
 * On failure it prints the backend log, which is the one artifact that says
 * *why* the engine stopped -- otherwise a broken build is indistinguishable
 * from a slow one.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

/** Candidate executable names, in the order electron-builder emits them. */
const EXECUTABLES = [
  "SpikeForge Desktop.exe",
  "SpikeForge Desktop",
  "spikeforge-desktop",
  "spikeforge-dashboard",
];

const START_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 500;
/** Matches the line uvicorn prints once it is accepting connections. */
const PORT_PATTERN = /Uvicorn running on https?:\/\/[\d.]+:(\d+)/;
/**
 * Matches the line `desktop/main.cjs` writes when the engine stops.
 *
 * An engine that starts and then dies leaves the application showing a modal
 * dialog, which nothing dismisses on a build machine. Without this the run
 * would burn the whole start timeout before reporting a failure the log
 * already described.
 */
const EXIT_PATTERN = /^backend exited: code=(.*)$/m;

function parseArgs(argv) {
  const args = { app: null, exe: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--app") args.app = argv[i + 1];
    if (argv[i] === "--exe") args.exe = argv[i + 1];
  }
  if (!args.app && !args.exe) {
    throw new Error("usage: smoke_packaged_desktop.mjs --app DIR | --exe PATH");
  }
  return args;
}

/** Resolve the Electron binary inside a packaged application directory. */
function resolveExecutable({ app, exe }) {
  if (exe) {
    if (!existsSync(exe)) throw new Error(`no such executable: ${exe}`);
    return exe;
  }
  for (const name of EXECUTABLES) {
    const candidate = path.join(app, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `no SpikeForge Desktop executable in ${app} ` +
      `(looked for: ${EXECUTABLES.join(", ")})`,
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET a URL and resolve its status and body, or reject on any failure. */
function get(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 5_000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () =>
        resolve({ status: response.statusCode, body }),
      );
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
  });
}

/** Kill a process and everything it spawned. */
function killTree(pid) {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"]);
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone, which is what this is reaching for anyway.
  }
}

/**
 * Report everything known about a failed launch.
 *
 * The backend log is written by `desktop/main.cjs` and holds the engine's own
 * stdout and stderr, so it carries the Python traceback, the missing DLL, or
 * the `spawn error` that explains a silent exit.
 */
function report(state, logPath) {
  console.error(`\n--- electron exit code: ${state.exitCode} ---`);
  console.error(`--- electron stdout ---\n${state.stdout || "(empty)"}`);
  console.error(`--- electron stderr ---\n${state.stderr || "(empty)"}`);
  if (existsSync(logPath)) {
    console.error(`--- backend log (${logPath}) ---`);
    console.error(readFileSync(logPath, "utf8") || "(empty)");
  } else {
    console.error(
      `--- backend log ---\nnot written: ${logPath}\n` +
        "Electron never reached the point of spawning the engine.",
    );
  }
}

async function main() {
  const executable = resolveExecutable(parseArgs(process.argv.slice(2)));
  const scratch = mkdtempSync(path.join(tmpdir(), "spikeforge-smoke-"));
  const profile = path.join(scratch, "profile");
  const logPath = path.join(profile, "logs", "backend.log");

  console.log(`launching: ${executable}`);
  console.log(`profile:   ${profile}`);

  const child = spawn(executable, [`--user-data-dir=${profile}`], {
    // A packaged Electron build inherits the runner's environment. Clearing
    // the Node-mode switches keeps a CI shell from turning the launch into a
    // plain Node process that rejects Electron's own arguments.
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
      ELECTRON_ENABLE_LOGGING: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const state = { stdout: "", stderr: "", exitCode: null };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => (state.stdout += chunk));
  child.stderr.on("data", (chunk) => (state.stderr += chunk));
  child.on("exit", (code) => (state.exitCode = code));

  const deadline = Date.now() + START_TIMEOUT_MS;
  let port = null;
  while (Date.now() < deadline && port === null) {
    // A packaged app that quits on its own will never write a port. Treating
    // that as terminal turns a five-minute timeout into an immediate report.
    if (state.exitCode !== null) {
      console.error("the application exited before its engine was ready");
      report(state, logPath);
      process.exit(1);
    }
    if (existsSync(logPath)) {
      const log = readFileSync(logPath, "utf8");
      const stopped = EXIT_PATTERN.exec(log);
      if (stopped) {
        console.error(`the engine stopped before it was ready: ${stopped[1]}`);
        report(state, logPath);
        killTree(child.pid);
        process.exit(1);
      }
      const match = PORT_PATTERN.exec(log);
      if (match) port = Number(match[1]);
    }
    if (port === null) await sleep(POLL_INTERVAL_MS);
  }

  if (port === null) {
    console.error(
      `the engine did not report a port within ${START_TIMEOUT_MS}ms`,
    );
    report(state, logPath);
    killTree(child.pid);
    process.exit(1);
  }

  console.log(`engine reported port ${port}; checking /health`);
  try {
    const { status, body } = await get(`http://127.0.0.1:${port}/health`);
    if (status !== 200 || JSON.parse(body).status !== "ok") {
      throw new Error(`unexpected /health response: ${status} ${body}`);
    }
  } catch (error) {
    console.error(`/health did not answer: ${error.message}`);
    report(state, logPath);
    killTree(child.pid);
    process.exit(1);
  }

  console.log("packaged desktop smoke test passed");
  killTree(child.pid);
  process.exit(0);
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});
