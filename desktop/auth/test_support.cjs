/**
 * Shared test-only helper: a throwaway HTTP server standing in for
 * hub-api, so the auth modules' tests never touch a real deployment.
 *
 * Not itself a `*.test.cjs` file, so `node --test` does not try to run it.
 */

const http = require("node:http");

const { reservePort } = require("../main_helpers.cjs");

/** Start a fake hub-api that answers every request with `responder(req,
 * rawBody)`, returning `{ status, body }` (status defaults to 200). */
async function fakeHubApi(responder) {
  const port = await reservePort();
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const result = responder(request, raw);
      response.writeHead(result.status ?? 200, {
        "Content-Type": "application/json",
      });
      response.end(JSON.stringify(result.body ?? {}));
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => server.close(),
  };
}

module.exports = { fakeHubApi };
