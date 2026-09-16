# End-to-end suite

These tests drive the built dashboard in a real browser against a real
SpikeForge server. The dashboard is a client with no logic of its own worth
testing in isolation, so the suite is deliberately integration-level: there are
no mocked sockets and no stubbed payloads. Every assertion below is backed by a
server that loaded MNIST, ran a network, and answered over the versioned
WebSocket protocol.

## Running it

```bash
npm ci
npm run e2e:install    # the Playwright browser, once per machine
npm run test:e2e       # builds dist/, then runs the smoke tier
```

The first run provisions a Python environment under `.venv-e2e/` and downloads
MNIST into `.e2e-data/`. That takes a few minutes. Both are cached, so later
runs start in seconds.

| Command | What it runs |
| --- | --- |
| `npm run test:e2e` | Smoke tier in Chromium (~35s once warm) |
| `npm run test:e2e:full` | Full workflows, including a real training run (~6 min) |
| `npm run test:e2e:electron` | Smoke tier plus shell specs in the desktop app (~45s) |
| `npm run test:e2e:all` | Everything |
| `npm run e2e:typecheck` | Type-checks the suite itself |

`npx playwright show-report` opens the HTML report. A failed test keeps a
trace, a video, and a screenshot under `test-results/`.

## How the server gets there

`scripts/provision_e2e_backend.py` builds `.venv-e2e/` and installs Torch from
the CPU wheel index plus the five SpikeForge distributions. It writes a stamp
describing what it installed and exits early when the stamp already matches, so
re-running costs nothing.

Two sources are available:

- **`pypi`** (the default) installs the pinned release combination in
  [`backend-pins.json`](backend-pins.json). That combination mirrors
  `compatibility.json` in the core repository and is what the Docker image and
  the desktop application ship, so it answers "does the thing we are about to
  release work".
- **`local`** installs a working checkout as editable distributions:

  ```bash
  SPIKEFORGE_E2E_SOURCE=local npm run test:e2e
  ```

  It defaults to `../spikeforge`; override with `SPIKEFORGE_E2E_REPO`. Use this
  to catch an integration break in the core repo before it is published.

`scripts/run_e2e_server.mjs` then starts the server through
`desktop/backend_entry.py` — the same entry point the packaged desktop backend
is frozen from — with `SPIKEFORGE_DASHBOARD_DIST` pointed at the freshly built
`dist/`. The dashboard and `/ws` are served from one origin, which is how Docker
serves it and how the desktop app loads it. A Vite dev server with a proxy would
test a topology nobody ships.

Datasets and hub downloads are cached in `.e2e-data/` across runs. Anything the
tests themselves write — checkpoints, pipelines, registries — goes to
`.e2e-data/state/`, which is wiped at server start so no run inherits another
run's state.

## The projects

**`smoke`** gates every change. It covers booting, connecting, reconnecting
after a dropped socket, all six tabs rendering, the four bootstrap requests
landing in the interface, and the protocol version handshake in both directions.
It does not train anything.

**`full-setup`** trains two small models through the interface: `e2e-baseline`
(`fc_legacy`) and `e2e-conv` (`conv_net`). It is both the training coverage and
the fixture the rest of the tier loads.

Two topologies, not one, because they do not accept the same run body: a
convolutional first stage needs `[C, H, W]` where a fully connected one takes a
flat vector. A suite with only the fully connected checkpoint passed while the
Pipeline tab's default input could not run against a conv model at all.

**`full`** covers the checkpoint lifecycle, inference, deployment reports and
energy estimates, the hub catalog, and pipeline runs. It depends on `smoke` and
`full-setup`, so Playwright orders them.

**`electron`** runs the smoke specs inside the packaged shell's window, plus
`specs/electron/` for what only the desktop application does: supervising an
engine on an ephemeral port, keeping data in the per-user application directory,
refusing to navigate away from the local app, and stopping its engine on quit.

## Known issue: Electron teardown on CI

The desktop specs pass — 37/37 locally in about 90 seconds, and 37/37 on a CI
runner too. What does not work on CI is Playwright's teardown of the shared
Electron application: after every test has passed, the worker fails to exit and
burns its full five-minute budget, so the run reports a failure with no failing
test.

It has done this on three runs, through two attempted fixes — bounding
`app.close()` with a deadline, then killing the whole process tree including
the Python grandchild — and it has never reproduced locally. The cause is not
yet understood. What is ruled out: the specs themselves, the backend shim's
signal handling (it exits in about a second when signalled directly), and the
desktop app's own quit path, which had a real bug that is fixed and separately
tested (`hasExited` in `desktop/main_helpers.test.cjs`).

Because of that, the Electron project runs in its own workflow
(`.github/workflows/electron-e2e.yml`) rather than in `ci.yml`. A pull request
whose tests all pass should not show red, because that teaches people to ignore
the signal. The workflow is **not** `continue-on-error`, so a genuine spec
failure still turns it red. Move it back into `ci.yml` once the teardown is
fixed.

If you pick this up: the next thing to try is not another patch to the cleanup
path but changing the shape — launch a fresh Electron application per spec file
instead of sharing one per worker, and measure what that costs.

## Writing a spec

Specs ask for the `dashboard` fixture and get a connected application. They do
not know whether they are looking at a Chromium tab or the Electron window,
which is what lets the smoke tier run in both.

```ts
import { expect, test } from "../../fixtures/dashboard";

test("does the thing", async ({ dashboard }) => {
  await dashboard.tab("viewer");
  await expect(dashboard.predictionPanel).toBeVisible();
});
```

Two selector conventions are in play:

- **Panels** use the `data-tour` attribute they already carry for the guided
  tour, via `dashboard.tourTarget("energy")`. Those hooks are product code, so a
  spec that uses one cannot drift away from what the tour points at.
- **Controls** use `data-testid`, and labelled sliders and dropdowns use
  `data-field`. The interface is translated into eight languages, so button text
  is not a selector. The `dashboard` fixture pins the locale to English anyway,
  so an untranslated string in an assertion is stable.

Canvases need `dashboard.expectCanvasDrawn()`. A visible `<canvas>` only proves
the component mounted; reading its pixels proves the server's data arrived.

For contracts the interface offers no way to drive — a malformed protocol
frame, a missing version — use `dashboard.protocolExchange()`, which opens a raw
socket from inside the page so the origin and any access token match the
application's own.

## Electron in a VS Code terminal

VS Code exports `ELECTRON_RUN_AS_NODE=1` to its child processes, which makes the
Electron binary behave as plain Node and reject its own switches.
`support/electron.ts` strips it before launching, so the Electron project works
from an integrated terminal.
