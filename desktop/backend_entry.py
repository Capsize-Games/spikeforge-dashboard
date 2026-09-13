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


def main(argv: Sequence[str] | None = None) -> None:
    args_list = list(sys.argv[1:] if argv is None else argv)
    if _run_frozen_child(args_list):
        return
    args = _parser().parse_args(args_list)

    # Import after parsing so child-module dispatch does not initialize the
    # FastAPI application (or warm a Torch device) unnecessarily.
    from server.app import app, health
    from server.web import client_dist

    if args.self_test:
        if asyncio.run(health()) != {"status": "ok"}:
            raise RuntimeError("health handler self-test failed")
        dashboard = client_dist()
        if dashboard is None or not (dashboard / "index.html").is_file():
            raise RuntimeError("packaged dashboard self-test failed")
        print("SpikeForge backend self-test passed")
        return
    if args.port is None:
        raise SystemExit("--port is required unless --self-test is used")

    # Pure-Python protocol implementations are a little slower than uvloop
    # and httptools, but freeze consistently on Linux and Windows and are more
    # than adequate for a single local dashboard connection.
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=False,
        loop="asyncio",
        http="h11",
        ws="websockets",
    )


if __name__ == "__main__":
    main()
