# spikeforge-dashboard

[![CI](https://github.com/capsize-games/spikeforge-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/capsize-games/spikeforge-dashboard/actions/workflows/ci.yml)
[![Discord](https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?logo=discord&logoColor=white)](https://capsizegames.com/discord)
[![Status: pre-1.0](https://img.shields.io/badge/status-pre--1.0-orange.svg)](package.json)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/capsize-games/spikeforge-dashboard/pulls)

![spikeforge dashboard](images/dashboard.png)

The browser dashboard for the
[spikeforge](https://github.com/capsize-games/spikeforge) spiking-neural-network
interpreter: a React + Vite single-page app that talks to the interpreter
server over a versioned WebSocket protocol.

- **Protocol version:** `1.0` — see
  [`protocol/protocol_version.txt`](protocol/protocol_version.txt).
- **Protocol contract:** the JSON Schemas under [`protocol/`](protocol) are
  the authority for this repo's generated TypeScript — see
  [`protocol/README.md`](protocol/README.md) for the compatibility policy.
  `src/protocol/generated.ts` is generated from them, so edit the schemas,
  never the generated file.

## Development

```bash
npm ci
npm run gen:protocol   # regenerate src/protocol/generated.ts from protocol/
npm run dev            # Vite dev server on :5173, proxies /ws to :8877
```

## Build

```bash
npm run build
```

## Tests

```bash
npm run desktop:test   # Electron shell helpers (node --test)
npm run e2e:install    # the Playwright browser, once per machine
npm run test:e2e       # end-to-end smoke tier against a real SpikeForge server
```

The end-to-end suite drives the built dashboard in a browser and in the desktop
app against a real engine, with no mocked sockets. It provisions its own Python
environment on first run. See [`tests/e2e/README.md`](tests/e2e/README.md) for
the tiers, the backend sources, and how to write a spec.

CI picks the tier from the diff, so a protocol change gets the full run and a
documentation change gets none. Contributors and coding agents should read
[`AGENTS.md`](AGENTS.md) for the repository's conventions and for which files
are generated rather than edited.

## Desktop application

SpikeForge Desktop packages this exact dashboard with a local, CPU-only
SpikeForge engine. Electron supervises the engine on an ephemeral localhost
port; datasets, checkpoints, hub downloads, and logs live in the operating
system's per-user application-data directory.

Release builds are produced natively on Linux and Windows by
`.github/workflows/desktop-release.yml`. Each job freezes the Python/Torch
backend, launches it on the target runner, verifies `/health`, and only then
packages the Electron application.

For a local Linux build, install the SpikeForge distributions and PyInstaller
in a virtual environment, then run:

```bash
python scripts/build_desktop_backend.py
npm run desktop:dist
```

The release artifacts are written to `release/`. The initial desktop edition
is CPU-only by design; Python and Docker installs remain the supported route
for CUDA and optional vendor SDKs.

## Citing

This dashboard is the browser frontend for spikeforge, not an independently
citable artifact — it doesn't carry its own CITATION.cff. If spikeforge is
useful in your research, please cite the main repository:
[capsize-games/spikeforge](https://github.com/capsize-games/spikeforge).

## License

BSD-3-Clause. See [`LICENSE`](LICENSE).
