"""Frozen entry point for the SpikeForge desktop backend."""

from __future__ import annotations

import argparse
import asyncio
import runpy
import sys
from collections.abc import Sequence

import uvicorn


CHILD_MODULES = {
    "spikeforge.data.download_cli",
    "spikeforge_hub.download_cli",
}


def _run_frozen_child(argv: Sequence[str]) -> bool:
    """Emulate ``python -m`` for workers spawned by the server."""

    if len(argv) < 2 or argv[0] != "-m" or argv[1] not in CHILD_MODULES:
        return False
    sys.argv = [argv[1], *argv[2:]]
    runpy.run_module(argv[1], run_name="__main__")
    return True


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="spikeforge-backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int)
    parser.add_argument("--self-test", action="store_true")
    return parser


def _self_test() -> None:
    """Check frozen runtime data, the health handler, and dashboard files."""
    from backend_data import check_runtime_data
    from server.app import health
    from server.web import client_dist

    check_runtime_data()
    if asyncio.run(health()) != {"status": "ok"}:
        raise RuntimeError("health handler self-test failed")
    dashboard = client_dist()
    if dashboard is None or not (dashboard / "index.html").is_file():
        raise RuntimeError("packaged dashboard self-test failed")
    print("SpikeForge backend self-test passed")


def _serve(host: str, port: int) -> None:
    """Initialize the server only after child dispatch and argument parsing."""
    from server.app import app

    # Pure-Python protocol implementations are a little slower than uvloop
    # and httptools, but freeze consistently on Linux and Windows and are more
    # than adequate for a single local dashboard connection.
    uvicorn.run(
        app,
        host=host,
        port=port,
        reload=False,
        loop="asyncio",
        http="h11",
        ws="websockets",
    )


def main(argv: Sequence[str] | None = None) -> None:
    """Dispatch frozen workers, native self-tests, or the desktop server."""
    args_list = list(sys.argv[1:] if argv is None else argv)
    if _run_frozen_child(args_list):
        return
    args = _parser().parse_args(args_list)
    if args.self_test:
        _self_test()
        return
    if args.port is None:
        raise SystemExit("--port is required unless --self-test is used")
    _serve(args.host, args.port)


if __name__ == "__main__":
    main()
