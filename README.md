# spikeforge-dashboard

[![CI](https://github.com/capsize-games/spikeforge-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/capsize-games/spikeforge-dashboard/actions/workflows/ci.yml)
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

## Citing

This dashboard is the browser frontend for spikeforge, not an independently
citable artifact — it doesn't carry its own CITATION.cff. If spikeforge is
useful in your research, please cite the main repository:
[capsize-games/spikeforge](https://github.com/capsize-games/spikeforge).

## License

BSD-3-Clause. See [`LICENSE`](LICENSE).
