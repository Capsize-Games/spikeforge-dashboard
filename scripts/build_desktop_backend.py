"""Build and smoke-test the frozen desktop backend on the current OS."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parent.parent
DESKTOP = ROOT / "desktop"
RUNTIME = DESKTOP / "runtime"


def _free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def _executable(bundle: Path) -> Path:
    suffix = ".exe" if os.name == "nt" else ""
    return bundle / f"spikeforge-backend{suffix}"


def _relocate_licences(bundle: Path) -> None:
    """Move each distribution's metadata licence tree to a top-level folder.

    PyInstaller records them as ``<name>.dist-info/licenses/...``, and numpy's
    is nested several levels deep. butler patches the new Windows archive
    against the one already on the itch.io channel and dies on that path with
    ``lstat ...numpy/linalg: not a directory``, so the channel never updates.
    Rewriting ``datas`` in the spec is not enough: PyInstaller's own hooks add
    the metadata during Analysis, after the spec's list is built. Doing it here,
    on the finished bundle, catches every distribution. No licence text is
    dropped — the BSD notices have to ship — only the path changes.
    """
    for dist_info in sorted(bundle.glob("*.dist-info")):
        licences = dist_info / "licenses"
        if not licences.is_dir():
            continue
        name = dist_info.name[: -len(".dist-info")]
        target = bundle / "third_party_licenses" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(licences), str(target))


def _smoke_test(bundle: Path) -> None:
    executable = _executable(bundle)
    env = os.environ.copy()
    env["SPIKEFORGE_DATA_DIR"] = str(RUNTIME / "smoke-data")
    env["SPIKEFORGE_DASHBOARD_DIST"] = str(ROOT / "dist")
    subprocess.run(
        [str(executable), "--self-test"], env=env, check=True, timeout=120
    )

    if os.environ.get("SPIKEFORGE_DESKTOP_SKIP_NETWORK_SMOKE") == "1":
        print("network smoke test skipped by SPIKEFORGE_DESKTOP_SKIP_NETWORK_SMOKE")
        return

    port = _free_port()
    process = subprocess.Popen(
        [str(executable), "--host", "127.0.0.1", "--port", str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
    )
    deadline = time.monotonic() + 120
    try:
        while time.monotonic() < deadline:
            if process.poll() is not None:
                output = process.stdout.read() if process.stdout else ""
                raise RuntimeError(
                    f"backend exited with {process.returncode}:\n{output}"
                )
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{port}/health", timeout=2
                ) as response:
                    payload = json.load(response)
                if payload == {"status": "ok"}:
                    return
            except (OSError, ValueError):
                time.sleep(0.5)
        raise RuntimeError("backend health check timed out")
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-build", action="store_true", help="only test an existing bundle"
    )
    args = parser.parse_args()

    bundle = RUNTIME / "spikeforge-backend"
    if not args.skip_build:
        shutil.rmtree(bundle, ignore_errors=True)
        subprocess.run(
            [
                sys.executable,
                "-m",
                "PyInstaller",
                "--clean",
                "--noconfirm",
                "--distpath",
                str(RUNTIME),
                "--workpath",
                str(RUNTIME / "build"),
                str(DESKTOP / "spikeforge_backend.spec"),
            ],
            cwd=DESKTOP,
            check=True,
        )
    _relocate_licences(bundle)
    _smoke_test(bundle)
    print(f"desktop backend smoke test passed: {_executable(bundle)}")


if __name__ == "__main__":
    main()
