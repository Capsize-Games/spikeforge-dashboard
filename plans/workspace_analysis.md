# Workspace analysis: independent release vs pnpm workspace

Analysis record for Capsize-Games/spikeforge-dashboard#21. It compares
keeping the dashboard an independently released consumer against joining
a pnpm workspace with the spikeforge clients, with the release-cadence
rationale each side carries. It records analysis only; the decision
itself needs Capsize-Games/hq#31 and is not taken here.

## Current shape (facts)

- The dashboard is its own repository and release line: package
  `spikeforge-dashboard`, `private: true`, version 0.2.9, installed and
  locked with npm (`package-lock.json`; no pnpm files). Desktop
  releases ship from it (0.2.4, 0.2.5, 0.2.8, 0.2.9).
- The canonical spikeforge client lives inside the engine repository
  (`client/` in Capsize-Games/spikeforge): same package name
  `spikeforge-dashboard`, `private: true`, version 0.1.0, also npm.
  Two same-named packages cannot sit in one workspace unchanged.
- Engine distributions release on their own cadence (`spikeforge`
  0.5.2, `spikeforge-server` 0.3.0, `spikeforge-serve` 0.2.0, and so
  on), recorded in the engine's `compatibility.json`.
- The dashboard already tracks that cadence without a workspace: the
  generated `tests/e2e/backend-pins.json` mirrors the newest
  `compatibility.json` entry and is refreshed nightly by
  `sync-backend-pins.yml`. Each repo also carries its own `protocol/`
  tree and `gen:protocol` script (dashboard protocol 1.0, canonical
  client protocol 1.1 at the time of writing).
- Shared code already flows through the npm registry, not a monorepo:
  the dashboard depends on `@capsizellc/commons@^0.1.1` for
  `scripts/sync_backend_pins.mjs` and, as of the adopting pull request,
  for one `src/` utility. No Git dependency, no workspace link.

## Independent release (stay as is)

- Release cadence stays decoupled by construction: dashboard Desktop
  releases, engine distribution releases, and shared-package releases
  each move when ready, with `backend-pins.json` and the protocol
  version recording which combination is supported.
- Cost of the seam is visible and bounded: the pins sync, the protocol
  codegen in each repo, and version bumps on the shared packages.
- Nothing in the current tree assumes a workspace: npm tooling,
  lockfiles, and CI (including the tier selector's path rules) all
  describe one repository.

## pnpm workspace with the spikeforge clients

- pnpm workspaces are single-repository. The dashboard and the engine
  are separate repositories, so this option means either merging the
  repositories or a cross-repository mechanism pnpm does not provide
  natively — a restructure, not a configuration change.
- It would also require renaming at least one of the two
  `spikeforge-dashboard` packages, converting npm lockfiles and CI to
  pnpm, and deciding how Desktop releases, engine distribution
  releases, and shared-package releases version together or apart.
- The underlying question is cadence coupling: a shared workspace makes
  lockstep cheap and independence awkward, which fits only if the
  dashboard, the engine distributions, and the shared packages are
  meant to release together. Today they do not: Desktop, engine, and
  protocol versions all advance separately.

## What this pull request does

Adopts `@capsizellc/commons` for one `src/` utility (the same
`isPlainObject` guard adoption as the canonical client) and records
this analysis. Explicitly out: `@capsizellc/ui` (blocked: it peers
React 19 while the dashboard is React 18), the workspace verdict
(Capsize-Games/hq#31), and any repository restructure.

## Follow-up: `@capsizellc/ui` evaluated, not adopted (2026-11-25, refs #21)

The React peer blocker is gone: the dashboard is React `^19.3.0`
and `@capsizellc/ui@0.1.2` (latest on the registry) peers
`react@^19.0.0`. Adoption was still refused, on product grounds:

- The package ships the fleet theme (`src/tokens.css`: `--cap-bg`
  `#0b0f14`, `--cap-primary` `#4f8cff`, `--cap-radius` `10px`).
  The dashboard is the deliberate "SpikeForge Studio" system
  (`src/styles/base.css`: `--surface-1` `#0b1017`, `--accent`
  `#70cfff`, `--radius` `4px`). Mapping local tokens onto fleet
  tokens is a visible restyle, which the issue forbids.
- `Button`, `Panel` and `Stack` render Tailwind utilities from the
  package's `tailwind-preset`. The repo has no Tailwind or PostCSS
  (no config, no dependency), so one adopted component would drag
  in a second styling build on top of the plain-CSS sheets.
- Local near-duplicates were checked and kept deliberately:
  `suggestSlug` in `src/hubPublishValidation.ts` preserves dots
  and falls back to `"model"`, while commons `slugify` hyphenates
  dots with no fallback — swapping changes publish behavior.

What stands: `@capsizellc/commons` for `isPlainObject` in
`src/components/pipelineInput.ts` and `fetchJson` in
`scripts/sync_backend_pins.mjs`, both registry-resolved with no Git
dependency, pinned by `scripts/shared_frontend_deps.test.mjs`.
Evidence this round: clean `npm ci`, `npm run build` green
(`tsc -b` plus vite, ~2s), `node --test` on the new guard file
(4 pass). No local implementation qualified for invisible removal,
so none was removed; the before/after metric is 2 shared imports,
0 Git dependencies, 0 visual diffs.

Workspace recommendation (verdict still needs Capsize-Games/hq#31):
stay an independently released consumer. The two
`spikeforge-dashboard` packages still share a name, Desktop/engine
releases still advance separately, and the pins coupling already
detects drift on its own (it caught 0.6.0 vs 0.6.3 during this
task). A shared workspace would rename a package and recouple
release cadences for no coupling the registry does not already
provide.
