/**
 * Polling loop for the device-code fallback (RFC 8628), used when the
 * loopback hand-off cannot: a remote/SSH session, no browser handler, or a
 * locked-down desktop.
 *
 * `delay` is injected so a test can drive the loop without waiting out real
 * polling intervals.
 */

const oauthClient = require("./oauth_client.cjs");

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const SLOW_DOWN_STEP_MS = 5000;

function defaultDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a poller bound to one device-code attempt's client and hub.
 * `poll(started, onStatus)` runs until a terminal state, calling `onStatus`
 * exactly once with `{ status: "granted", pair }`, `{ status: "expired" }`,
 * or `{ status: "denied" }`. `cancel()` stops the loop before the next wait.
 */
function createDeviceCodePoller({
  baseUrl,
  clientId,
  delay = defaultDelay,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let cancelled = false;

  async function poll(started, onStatus) {
    const deadline = Date.now() + timeoutMs;
    let intervalMs = started.intervalSeconds * 1000;
    while (!cancelled && Date.now() < deadline) {
      await delay(intervalMs);
      if (cancelled) return;
      const result = await oauthClient.pollDeviceCode({
        baseUrl,
        clientId,
        deviceCode: started.deviceCode,
      });
      if (result.status === "slow_down") {
        intervalMs += SLOW_DOWN_STEP_MS;
        continue;
      }
      if (result.status === "pending") continue;
      onStatus(result);
      return;
    }
  }

  function cancel() {
    cancelled = true;
  }

  return { poll, cancel };
}

module.exports = { createDeviceCodePoller };
