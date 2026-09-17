/**
 * The one-shot HTTP listener that catches the loopback PKCE redirect.
 *
 * `reservePort()` (`main_helpers.cjs`) finds the port; this is what actually
 * binds to it once the system browser has been sent there. Plain `node:http`
 * only -- no Electron dependency -- so it can be driven by a real HTTP
 * request in a `node --test` run, the same way `reservePort()` itself is
 * tested.
 */

const http = require("node:http");

const CALLBACK_PATH = "/callback";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function page(title, body) {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<title>${title}</title></head><body>${body}</body></html>`
  );
}

const SUCCESS_PAGE = page(
  "SpikeForge sign-in",
  "<p>Signed in. You can close this tab and return to SpikeForge Desktop.</p>",
);

function errorPage(message) {
  return page("SpikeForge sign-in", `<p>Sign-in failed: ${message}</p>`);
}

/**
 * Listen on `port` for exactly one OAuth redirect to `/callback`, then close.
 *
 * Resolves with `{ code, state }` on a normal redirect, rejects if the
 * provider reported an `error`, if the request was malformed, or if nothing
 * arrives within `timeoutMs`. `signal` lets the caller cancel early (the user
 * closing the "waiting for your browser" dialog).
 */
function waitForLoopbackCallback(
  port,
  { host = "127.0.0.1", timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {},
) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const server = http.createServer((request, response) => {
      handleRequest(request, response, finish);
    });

    const timer = setTimeout(() => {
      finish(
        new Error("timed out waiting for the browser to complete sign-in"),
      );
    }, timeoutMs);
    timer.unref();

    const onAbort = () => finish(new Error("sign-in was cancelled"));
    signal?.addEventListener("abort", onAbort);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      server.close();
      if (error) reject(error);
      else resolve(value);
    }

    server.on("error", (error) => finish(error));
    server.listen(port, host);
  });
}

/** Handle exactly one request; only a `/callback` hit settles the promise. */
function handleRequest(request, response, finish) {
  const url = new URL(request.url ?? "/", "http://loopback");
  if (url.pathname !== CALLBACK_PATH) {
    response.writeHead(404).end();
    return;
  }

  const error = url.searchParams.get("error");
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  if (error) {
    const description =
      url.searchParams.get("error_description") ?? error;
    response.end(errorPage(description));
    finish(new Error(`sign-in was refused: ${description}`));
    return;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    response.end(errorPage("the redirect was missing its code or state"));
    finish(new Error("loopback redirect was missing code or state"));
    return;
  }

  response.end(SUCCESS_PAGE);
  finish(null, { code, state });
}

module.exports = { waitForLoopbackCallback, CALLBACK_PATH };
