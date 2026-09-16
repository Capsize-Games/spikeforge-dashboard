# Agent guide — spikeforge-dashboard

Instructions for any coding agent working in this repository. Not specific to
one vendor; `CLAUDE.md` defers to this file.

## What this repository is

A React + Vite dashboard for the
[spikeforge](https://github.com/Capsize-Games/spikeforge) spiking-neural-network
engine. It is a **client**: it holds almost no logic of its own and talks to a
FastAPI server over a versioned WebSocket protocol. The same build is packaged
as SpikeForge Desktop, where Electron supervises a local engine.

That shape has one consequence worth internalising: a change that compiles and
type-checks has not been shown to work. The thing that shows it works is the
end-to-end suite, which runs the built app against a real server.

## Commands

```bash
npm ci
npm run build              # tsc -b && vite build; must pass before you are done
npm run desktop:test       # Electron shell helpers
npm run scripts:test       # tooling in scripts/
npm run e2e:typecheck      # type-checks the e2e suite (not covered by build)

npm run e2e:install        # Playwright browser, once per machine
npm run test:e2e           # smoke tier, ~35s once warm
npm run test:e2e:full      # real training, checkpoints, inference, ~6min
npm run test:e2e:electron  # the packaged desktop shell
npm run test:e2e:all       # everything
```

The first end-to-end run provisions a Python environment in `.venv-e2e/` and
downloads MNIST into `.e2e-data/`. Both are cached and gitignored.
[`tests/e2e/README.md`](tests/e2e/README.md) has the full picture.

## Things that are automated — do not do them by hand

**`tests/e2e/backend-pins.json` is generated.** It mirrors the last entry of
`compatibility.json` in `Capsize-Games/spikeforge`, which is the release
combination the Docker image and the desktop app ship.
`.github/workflows/sync-backend-pins.yml` refreshes it nightly and opens a pull
request. If you need it current right now:

```bash
npm run e2e:pins:check   # exits 1 and prints the drift
npm run e2e:pins:sync    # rewrites the file
```

Editing the versions by hand is not wrong so much as pointless — the next sync
overwrites it. Change `scripts/sync_backend_pins.mjs` if the rule itself is
wrong.

**Which end-to-end tier runs in CI is decided from the diff**, by
`scripts/select_e2e_tier.mjs`. Touching the protocol, the pinned engine, the
desktop shell, or the training/pipeline paths selects the full tier; touching
only `src/` selects smoke; touching only documentation selects neither.
`scripts/select_e2e_tier.test.mjs` pins those rules — change them there, with a
test, rather than by adding a manual CI step.

## Public-facing copy

This repository contains public-facing prose: the dashboard's own interface
labels and panel text (`src/i18n/`), `README.md`, and the store pages under
`marketing/`. Before drafting or editing any of it, read
[`COPY_POLICY.md`](COPY_POLICY.md) in this repository. It is the full policy;
what follows is a reminder of the parts that come up most here, not a
replacement for reading it.

- Interface labels name the destination, content, or action in familiar terms.
  Button text describes what the button does.
- Do not invent features, quantities, benchmarks, licensing terms, or
  audiences. Check the implemented behavior. Existing AI-generated wording is
  not a source of verified facts.
- Do not write text to fill a component. Deletion is a valid edit.
- Keep source attribution and required disclosures, including the pre-1.0 and
  measurement caveats. Do not delete them to shorten copy.
- Preserve approved wording during refactoring unless the task requires a
  change or behavior made it inaccurate.

The interface is translated into eight languages. An English change that is not
carried into `src/i18n/locales/` leaves the other locales stating something
different, so treat a copy change as a change to every locale.

## Code style — hard limits

These mirror `rules.md` in the core repository and are enforced by review.

- No file over **250 lines**. No React component over **200**. No hook or
  helper over **120**. Python: no function over **20** lines.
- Line length **80** (TypeScript) / **79** (Python).
- One exported component per file.
- **Never** use `any`, `as any`, `@ts-ignore`, `@ts-expect-error`,
  `eslint-disable`, `# noqa`, or `# type: ignore`. Fix the type.
- Do not use non-null assertions (`value!`). Narrow or guard instead. The one
  exception in the codebase is the `#root` mount in `main.tsx`.
- No stopgaps, shims, dead code, or unused exports.
- Comments explain **why**, not what.

When a limit is reached, extract a helper, a hook, or a component into its own
file. Do not grow a file past a limit because it is already past it.

Two files are over the line limit and predate these rules:
`src/components/PipelinePanel.tsx` and `src/App.tsx`. Shrink them if you are
working in them; do not add to them.

## Writing end-to-end tests

Specs take the `dashboard` fixture and do not know whether they are driving a
Chromium tab or the Electron window, which is what lets the smoke tier run in
both. Selector conventions:

- **Panels**: the `data-tour` attribute they already carry for the guided tour,
  via `dashboard.tourTarget("energy")`.
- **Controls**: `data-testid`. Labelled sliders and dropdowns: `data-field`.
  The interface is translated into eight languages, so button text is not a
  selector.
- **Canvases**: `dashboard.expectCanvasDrawn()`. A visible `<canvas>` only
  proves the component mounted; reading pixels proves the server's data
  arrived.

Assertions must be able to fail. Before trusting a new test, confirm it fails
when the behaviour it covers is broken.

## Commits and pull requests

Do not add AI vendor branding, "generated with" footers, session links, or AI
co-author trailers to commits, pull requests, issues, or release notes. Do not
claim human review or human-executed testing that did not happen. Describe what
was actually run, including anything skipped or excluded.
