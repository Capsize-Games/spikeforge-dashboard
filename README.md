# spikeforge-dashboard

The browser dashboard for the
[spikeforge](https://github.com/capsize-games/spikeforge) spiking-neural-network
interpreter: a React + Vite single-page app that talks to the interpreter
server over a versioned WebSocket protocol.

- **Protocol version:** `1.0` — see
  [`protocol/protocol_version.txt`](protocol/protocol_version.txt).
- **Protocol contract:** the JSON Schemas under [`protocol/`](protocol) are the
  single source of truth. `src/protocol/generated.ts` is generated from them, so
  edit the schemas, never the generated file.

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

## License

BSD-3-Clause. See [`LICENSE`](LICENSE).
