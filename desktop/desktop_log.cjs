/**
 * The desktop shell's own log.
 *
 * Separate from the engine log, and written from the moment the application
 * starts, because the failures it records happen before -- or instead of --
 * the engine ever running. A window that is created but never painted leaves
 * no other trace: the process is in the task list and nothing is on screen.
 */

const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

/** Append one timestamped line to `logs/desktop.log` under the profile. */
function logDesktop(message) {
  try {
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, "desktop.log"),
      `${new Date().toISOString()} ${message}\n`,
    );
  } catch {
    // Diagnostics must never become the reason a start fails.
  }
}

module.exports = { logDesktop };
