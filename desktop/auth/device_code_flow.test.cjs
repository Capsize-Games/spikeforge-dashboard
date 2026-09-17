const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { reservePort } = require("../main_helpers.cjs");
const { createDeviceCodePoller } = require("./device_code_flow.cjs");

/** A fake hub-api whose `/oauth/token` answers follow a fixed script. */
async function fakeHubApi(script) {
  let call = 0;
  const port = await reservePort();
  const server = http.createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      const next = script[Math.min(call, script.length - 1)];
      call += 1;
      response.writeHead(next.status ?? 200, {
        "Content-Type": "application/json",
      });
      response.end(JSON.stringify(next.body ?? {}));
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => server.close(),
    calls: () => call,
  };
}

const STARTED = { deviceCode: "dc_1", intervalSeconds: 1 };

test("reports granted once the poll succeeds, after pending/slow_down", async () => {
  const api = await fakeHubApi([
    { status: 400, body: { error: "authorization_pending" } },
    { status: 400, body: { error: "slow_down" } },
    {
      body: {
        access_token: "sfh_at_1",
        refresh_token: "sfh_rt_1",
        expires_in: 3600,
        scope: "models:read",
      },
    },
  ]);
  try {
    const poller = createDeviceCodePoller({
      baseUrl: api.baseUrl,
      clientId: "spikeforge-desktop",
      delay: () => Promise.resolve(),
    });
    let final = null;
    await poller.poll(STARTED, (result) => {
      final = result;
    });
    assert.equal(final.status, "granted");
    assert.equal(final.pair.accessToken, "sfh_at_1");
    assert.equal(api.calls(), 3);
  } finally {
    api.close();
  }
});

test("reports expired and denied as terminal, single-shot statuses", async () => {
  const expiredApi = await fakeHubApi([
    { status: 400, body: { error: "expired_token" } },
  ]);
  try {
    const poller = createDeviceCodePoller({
      baseUrl: expiredApi.baseUrl,
      clientId: "d",
      delay: () => Promise.resolve(),
    });
    let final = null;
    await poller.poll(STARTED, (result) => {
      final = result;
    });
    assert.deepEqual(final, { status: "expired" });
  } finally {
    expiredApi.close();
  }
});

test("cancel() stops the loop before its next poll", async () => {
  const api = await fakeHubApi([
    { status: 400, body: { error: "authorization_pending" } },
  ]);
  try {
    const poller = createDeviceCodePoller({
      baseUrl: api.baseUrl,
      clientId: "d",
      delay: () => Promise.resolve(),
    });
    let calledBack = false;
    const done = poller.poll(STARTED, () => {
      calledBack = true;
    });
    poller.cancel();
    await done;
    assert.equal(calledBack, false);
  } finally {
    api.close();
  }
});

test("stops polling once the timeout elapses without a terminal state", async () => {
  const api = await fakeHubApi([
    { status: 400, body: { error: "authorization_pending" } },
  ]);
  try {
    const poller = createDeviceCodePoller({
      baseUrl: api.baseUrl,
      clientId: "d",
      delay: () => Promise.resolve(),
      timeoutMs: 5,
    });
    let calledBack = false;
    await poller.poll(STARTED, () => {
      calledBack = true;
    });
    assert.equal(calledBack, false);
  } finally {
    api.close();
  }
});
