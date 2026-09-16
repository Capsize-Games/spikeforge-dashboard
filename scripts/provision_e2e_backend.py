#!/usr/bin/env python3
"""Build the virtual environment the end-to-end suite runs its server from.

The dashboard is a client: proving it works end to end means proving it works
against a real SpikeForge server, not a stand-in. This script provisions that
server into a throwaway virtual environment and is deliberately idempotent --
it writes a stamp describing what it installed and exits early when the stamp
already matches, so re-running the suite costs nothing.

Two sources are supported, selected with ``--source``:

``pypi`` (the default)
    Install the pinned release combination from ``tests/e2e/backend-pins.json``
    (see :mod:`e2e_backend_pins`). That combination mirrors
    ``compatibility.json`` in the core repository and is what the Docker image
    and the desktop application ship, so this is the mode that answers "does
    the thing we are about to launch work".

``local``
    Install a working checkout (``--repo``, default ``../spikeforge``) as
    editable distributions. This catches an integration break in the core repo
    before it is published, which the pinned mode cannot do until after a
    release.

Torch comes from the CPU wheel index in both modes: the suite never needs CUDA,
and the CPU wheels are a fraction of the download.
"""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
import venv
from pathlib import Path
from typing import Dict, List, Optional

from e2e_backend_pins import (
    REPO_ROOT,
    load_pins,
    local_requirements,
    pypi_requirements,
    torch_index_url,
)

DEFAULT_VENV = REPO_ROOT / ".venv-e2e"
STAMP_NAME = "spikeforge-e2e-stamp.json"


def venv_python(venv_dir: Path) -> Path:
    """Return the interpreter inside ``venv_dir`` for this platform."""
    if platform.system() == "Windows":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def _run(command: List[str]) -> None:
    """Run a provisioning command, streaming its output."""
    print(f"$ {' '.join(command)}", flush=True)
    subprocess.run(command, check=True)


def _git_head(repo: Path) -> Optional[str]:
    """Return the checkout's HEAD commit, or None outside a git tree."""
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    return result.stdout.strip()


def _stamp(
    source: str, pins: Dict[str, object], repo: Optional[Path]
) -> Dict[str, object]:
    """Describe the install so a matching one can be skipped.

    A local checkout stamps its HEAD commit, so a rebuilt core repository
    reprovisions instead of silently testing yesterday's code.
    """
    stamp: Dict[str, object] = {
        "source": source,
        "python": platform.python_version(),
    }
    if source == "pypi":
        stamp["packages"] = pins.get("packages")
        stamp["extras"] = pins.get("extras", {})
    else:
        stamp["repo"] = str(repo)
        stamp["head"] = _git_head(repo) if repo else None
    return stamp


def _read_stamp(venv_dir: Path) -> Optional[Dict[str, object]]:
    """Return the stamp of a previous provision, when one is present."""
    path = venv_dir / STAMP_NAME
    if not path.is_file():
        return None
    try:
        with path.open(encoding="utf-8") as handle:
            loaded = json.load(handle)
    except json.JSONDecodeError:
        return None
    return loaded if isinstance(loaded, dict) else None


def _ensure_venv(venv_dir: Path, force: bool) -> Path:
    """Create the environment when it is absent, and return its python."""
    if force and venv_dir.exists():
        shutil.rmtree(venv_dir)
    python = venv_python(venv_dir)
    if not python.is_file():
        print(f"creating {venv_dir}", flush=True)
        venv.EnvBuilder(with_pip=True, clear=True).create(venv_dir)
    return python


def _install(
    python: Path, source: str, pins: Dict[str, object], repo: Optional[Path]
) -> None:
    """Install Torch and the SpikeForge distributions for ``source``."""
    _run([str(python), "-m", "pip", "install", "--upgrade", "pip"])
    _run([
        str(python), "-m", "pip", "install",
        "--index-url", torch_index_url(pins),
        "torch", "torchvision",
    ])
    if source == "pypi":
        _run([str(python), "-m", "pip", "install", *pypi_requirements(pins)])
        return
    if repo is None:
        raise SystemExit("--source local requires --repo")
    _run([str(python), "-m", "pip", "install", *local_requirements(repo)])


def _verify(python: Path, source: str, repo: Optional[Path]) -> None:
    """Fail loudly when the environment cannot import the server.

    ``server.app`` imports FastAPI and warms a Torch device, so importing it
    here turns a broken install into an error during provisioning rather than
    a mystifying browser timeout twenty minutes later.
    """
    # A local checkout resolves `server/` and `spikeforge/` from the
    # repository root, which is on the path only as the working directory.
    cwd = str(repo) if source == "local" and repo else None
    subprocess.run(
        [
            str(python),
            "-c",
            "import server.app, server.protocol_version as v; "
            "print('protocol', v.PROTOCOL_VERSION)",
        ],
        check=True,
        cwd=cwd,
    )


def provision(
    venv_dir: Path, source: str, repo: Optional[Path], force: bool
) -> Path:
    """Create or refresh the environment and return its interpreter."""
    pins = load_pins()
    wanted = _stamp(source, pins, repo)

    if not force and _read_stamp(venv_dir) == wanted:
        python = venv_python(venv_dir)
        if python.is_file():
            print(f"e2e backend already provisioned: {venv_dir}")
            return python

    python = _ensure_venv(venv_dir, force)
    _install(python, source, pins, repo)
    with (venv_dir / STAMP_NAME).open("w", encoding="utf-8") as handle:
        json.dump(wanted, handle, indent=2, sort_keys=True)
    _verify(python, source, repo)
    print(f"e2e backend ready: {python}")
    return python


def _add_source_args(parser: argparse.ArgumentParser) -> None:
    """Add the options that select what gets installed."""
    parser.add_argument(
        "--source", choices=("pypi", "local"), default="pypi",
        help="install the pinned release combination, or a local checkout",
    )
    parser.add_argument(
        "--repo", type=Path, default=REPO_ROOT.parent / "spikeforge",
        help="core repository checkout used by --source local",
    )


def _add_venv_args(parser: argparse.ArgumentParser) -> None:
    """Add the options that select where and whether to install."""
    parser.add_argument(
        "--venv", type=Path, default=DEFAULT_VENV,
        help=f"virtual environment directory (default: {DEFAULT_VENV})",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="delete and rebuild the environment even when the stamp matches",
    )
    parser.add_argument(
        "--print-python", action="store_true",
        help="print only the interpreter path, provisioning nothing",
    )


def _parse_args(argv: Optional[List[str]]) -> argparse.Namespace:
    """Parse the provisioning options."""
    parser = argparse.ArgumentParser(
        prog="provision_e2e_backend",
        description="Provision the SpikeForge server the e2e suite uses.",
    )
    _add_source_args(parser)
    _add_venv_args(parser)
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    """Parse arguments and provision the environment."""
    args = _parse_args(argv)
    if args.print_python:
        print(venv_python(args.venv))
        return 0
    repo = args.repo.resolve() if args.source == "local" else None
    provision(args.venv.resolve(), args.source, repo, args.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
