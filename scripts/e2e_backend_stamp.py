"""What was installed last time, so an unchanged environment is not rebuilt.

The stamp is the provisioner's idempotency record. It is written **only after
the environment has been verified**, and cleared before a refresh begins.
Writing it earlier left a success-looking marker behind when verification
failed, so the next run short-circuited on it and reported an environment that
had never worked -- turning a clear provisioning error into a server that fails
to start minutes later.
"""

from __future__ import annotations

import json
import platform
import subprocess
from pathlib import Path
from typing import Dict, Optional

STAMP_NAME = "spikeforge-e2e-stamp.json"


def git_head(repo: Path) -> Optional[str]:
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


def describe(
    source: str, pins: Dict[str, object], repo: Optional[Path]
) -> Dict[str, object]:
    """Describe an install so a matching one can be skipped.

    A local checkout records its HEAD commit, so a rebuilt core repository
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
        stamp["head"] = git_head(repo) if repo else None
    return stamp


def read(venv_dir: Path) -> Optional[Dict[str, object]]:
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


def clear(venv_dir: Path) -> None:
    """Drop any stamp, so a failed refresh leaves no success marker."""
    (venv_dir / STAMP_NAME).unlink(missing_ok=True)


def write(venv_dir: Path, stamp: Dict[str, object]) -> None:
    """Record a verified install, atomically.

    Written through a temporary file and renamed, so an interrupted write
    cannot leave a truncated stamp that later parses as a different install.
    """
    path = venv_dir / STAMP_NAME
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(stamp, handle, indent=2, sort_keys=True)
    temporary.replace(path)
