# Fleet audit — spikeforge-dashboard

Fleet-audit record for
[Capsize-Games/spikeforge-dashboard#22](https://github.com/Capsize-Games/spikeforge-dashboard/issues/22).
Docs only; the code migration itself belongs to
[#21](https://github.com/Capsize-Games/spikeforge-dashboard/issues/21),
not to this record. Verified against `main` on 2026-10-13
(`package.json` version `0.2.9`).

## 1. Identity, boundary, owner, runtime

- **Canonical identity.** GitHub `Capsize-Games/spikeforge-dashboard`
  (public, default branch `main`); local checkout
  `Projects/spikeforge/spikeforge-dashboard`.
- **Owner and license.** Capsize LLC (`contact@capsizegames.com`),
  BSD-3-Clause. Public history; no rewrite or deletion is authorized
  by this audit.
- **Product boundary.** A React + Vite single-page app that talks to
  the spikeforge interpreter server over a versioned WebSocket
  protocol (currently `1.1`; negotiation is major-only, so `1.0` clients
  keep working). It is a **client**: it holds almost no
  logic of its own, and the end-to-end suite — built app against a
  real server — is what shows a change works.
- **Dashboard versus desktop-runtime boundary.**
  - `src/` is the web client (panels, hooks, protocol consumer).
  - `desktop/` is the Electron shell that supervises a local,
    CPU-only engine on an ephemeral localhost port.
  - `protocol/` mirrors the monorepo `protocol/` directory, which is
    the single source of truth for the wire contract
    (`protocol/README.md`); `src/protocol/generated.ts` is derived
    from it via codegen and is never edited by hand.
  - `tests/e2e/backend-pins.json` records the server combination the
    suite runs against; it is generated from the last row of
    `compatibility.json` in `Capsize-Games/spikeforge`.
- **Supported runtimes.** Node 22 in CI (`setup-node`), evergreen
  desktop browsers (Playwright Chromium in the suite), and the
  Electron 44 desktop shell (Linux AppImage, Windows installer/zip).

## 2. Deployment channels

- **`desktop-v*` tags** drive `.github/workflows/desktop-release.yml`:
  it checks out a pinned engine commit, builds the app, packs it with
  electron-builder, uploads the artifacts, creates the GitHub
  release, and publishes to itch.io
  (`capsizegames/spikeforge-desktop` via butler) in the same run —
  the itch step is mandatory, not best-effort.
- **Release automation.** `cut-release.yml` opens the version-bump PR
  (needs `AUTOMATION_TOKEN`), `tag-on-version-change.yml` tags on
  merge, and `release-verify.yml` checks the result.
- **No standalone web hosting.** No workflow deploys the built web
  app to a host; it ships as the desktop app's frontend and is
  served by Vite only in development.
- **CI.** `ci.yml` selects the e2e tier from the diff (conservative
  by default); the Electron specs run separately in
  `electron-e2e.yml`; `sync-backend-pins.yml` refreshes the backend
  pins nightly onto one stable branch.

## 3. Dependency table (`package.json` @ 0.2.9)

| Dependency | Current | Proposed authority | Exception / note |
| --- | --- | --- | --- |
| `react`, `react-dom` | `^18.3.1` | Shared frontend pins, in lockstep with monorepo `client/` | Already converged (identical pins both sides) |
| `typescript` | `^5.6.3` | Same | Already converged |
| `vite`, `@vitejs/plugin-react` | `^6.0.3`, `^4.3.4` | Same | Already converged |
| `@xyflow/react` | `^12.11.6` | Same | Already converged; graph viz stays a product choice |
| `lucide-react` | `^1.45.0` | Same | Already converged; icon set stays a product choice |
| `@types/react`, `@types/react-dom` | `^18.3.12`, `^18.3.1` | Same | Already converged |
| `json-schema-to-typescript` | `^16.0.0` | Same | Already converged; feeds protocol codegen |
| `@capsizellc/commons` | `^0.1.1` | The published package | Adopted: `fetchJson` in `scripts/sync_backend_pins.mjs` |
| `@playwright/test` | `^1.63.0` | Repository-local test tooling | No convergence target; e2e-only |
| `@types/node` | `^24.13.5` | Repository-local tooling | Build scripts and Electron shell only |
| `electron`, `electron-builder` | `^44.7.0`, `^26.15.3` | Repository-local desktop runtime | Explicit exception: desktop-only, outside web-frontend convergence |
| Server combo (`backend-pins.json`) | spikeforge 0.5.1, targets 0.2.1, hub 0.3.2, serve 0.2.4, server 0.3.4 | Monorepo `compatibility.json` | Automated nightly sync; never hand-edited |

Convergence check: monorepo `client/package.json` on `origin/main`
carries byte-identical pins for every row marked "already converged".
Version bumps must move the two manifests together until #21 decides
the workspace-versus-independent-release question.

## 4. Keep / migrate / retire

- **Keep (product-local, no extraction):** product panels, hooks,
  and stores (pipeline, training, energy, deployment, analysis);
  the protocol mirror plus codegen; the e2e suite and backend pins;
  the Electron shell and release automation; the `src/i18n/`
  locales; the hub-publish client flow; the canvas plot palette in
  `src/theme.tsx` (plot-specific colors that cannot be CSS
  variables). Graph and experiment semantics stay out of any generic
  package.
- **Migrate (in #21, not in this PR):** generic UI primitives
  (`Button`, `Badge`, `ConfirmDialog`, `CheckField`, `HelpTip`, …)
  to `@capsizellc/ui`; shared design tokens to the platform token
  surface; the pnpm-workspace-versus-independent-consumer decision
  with its release-cadence rationale.
- **Already migrated:** one non-visual utility —
  `@capsizellc/commons/http` `fetchJson` in
  `scripts/sync_backend_pins.mjs`.
- **Retire:** none identified. No dead or duplicated infrastructure
  was found that this audit can remove.

## 5. Migration metadata and scope guard

This repository has no `capsize.json` or `justfile`; `npm` scripts
are the task contract. Per issue item 4, that metadata is added only
when the repository can support the contract — not adopted here, and
left to #21 or the fleet coordinator to decide.

Per the scope guard, this repository remains an independent product
boundary. It consumes the monorepo protocol contract and the
`compatibility.json` server combination, and adopts shared frontend
packages only through the focused #21 pilot with its test evidence.
No extraction, deletion, or archive is authorized by this record.
