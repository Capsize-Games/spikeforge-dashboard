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
npm run scripts:test       # tooling + pure src/ helpers (node, TS, python)
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

The sync uses one stable branch (`chore/backend-pins`) rebuilt from `main` each
run, so repeated runs update a single pull request instead of opening a new one
per day. It also moves the engine commit the desktop application builds from,
in the same pull request — see below.

**The engine commit in `desktop-release.yml` is derived, not chosen.** It is
whatever `spikeforge-v<version>` points at for the `spikeforge` version in
`backend-pins.json`, so one version governs both the end-to-end suite and the
packaged application. `npm run e2e:pins:check` fails when they disagree.
Picking a SHA by hand is how that pin ended up on a commit that was not on the
engine's `main` at all — 92 ahead, 99 behind, orphaned by a history rewrite. It
still built, so nothing complained for a release and a half.

**A release is cut by workflow, not by hand.** `cut-release.yml` raises the
version as an auto-merging pull request; `tag-on-version-change.yml` pushes the
tag once it lands; `desktop-release.yml` builds from that tag; and
`release-verify.yml` downloads the published files afterwards and launches them
on both operating systems. Running `npm version` and `git tag` yourself skips
the check that main is green.

**Which end-to-end tier runs in CI is decided from the diff**, by
`scripts/select_e2e_tier.mjs`. The rules are **conservative by default**:
anything that can reach the application or the suite selects the full tier
unless it is on a short explicit list that cannot (styles, locales, prose).

That direction matters. An earlier version listed what *needed* the full tier,
and every omission failed dangerously — a change to a full-tier spec, to the
fixture every spec shares, or to the selector itself all selected a cheaper
tier than the change deserved. If you add a rule, add it to the exclusions only
when you are sure the smoke tier covers that file.

`scripts/select_e2e_tier.test.mjs` pins the rules, including those regressions.
`npm run scripts:test` runs unconditionally in CI's always-run job, so a broken
selector cannot excuse itself from its own tests.

**Every automated pull request and tag needs `AUTOMATION_TOKEN`.** GitHub does
not start workflow runs for events raised by the built-in `GITHUB_TOKEN`: a
pull request opened with it gets no checks and can never satisfy auto-merge,
and a tag pushed with it builds nothing. `sync-backend-pins.yml`,
`cut-release.yml`, `tag-on-version-change.yml` and `agent-issue.yml` all use
that secret, and refuse or warn rather than degrading quietly without it. An
automated pull request sitting with no checks means the secret is missing —
that is the cause, and it is not worth looking for another one.

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

## Known issue: Electron teardown on CI

The desktop specs pass; Playwright's teardown of the shared Electron app on CI
does not. The run reports a failure with no failing test. It is therefore in
its own workflow (`.github/workflows/electron-e2e.yml`), not `ci.yml`. See
[`tests/e2e/README.md`](tests/e2e/README.md) before attempting another fix —
two cleanup-path patches have already failed, and the suggested next step is to
change the shape rather than patch cleanup again.

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
