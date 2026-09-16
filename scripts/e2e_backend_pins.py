"""What the end-to-end suite installs, separated from how it installs it.

``tests/e2e/backend-pins.json`` is the single declaration of the SpikeForge
release combination the suite runs against, and this module turns it into pip
arguments. ``scripts/provision_e2e_backend.py`` owns the environment itself.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

REPO_ROOT = Path(__file__).resolve().parent.parent
PINS_PATH = REPO_ROOT / "tests" / "e2e" / "backend-pins.json"

#: The distributions a local checkout installs, in dependency order, each with
#: the extra it needs. The core repository's Dockerfile installs this same
#: closure; leaving one out does not fail loudly, it silently resolves that
#: pin from PyPI instead and tests a mix of the checkout and a published wheel.
LOCAL_DISTRIBUTIONS = (
    ("spikeforge", "nir"),
    ("spikeforge-targets", None),
    ("spikeforge-hub", None),
    ("spikeforge-serve", None),
    ("spikeforge-server", None),
)


def load_pins() -> Dict[str, object]:
    """Return the pinned release combination the suite targets."""
    with PINS_PATH.open(encoding="utf-8") as handle:
        loaded = json.load(handle)
    if not isinstance(loaded, dict):
        raise SystemExit(f"{PINS_PATH}: expected a JSON object")
    return loaded


def _object_field(pins: Dict[str, object], key: str) -> Dict[str, object]:
    """Return one JSON-object field, failing with the file and key named."""
    value = pins.get(key, {})
    if not isinstance(value, dict):
        raise SystemExit(f"{PINS_PATH}: '{key}' must be a JSON object")
    return value


def _extra_names(extras: Dict[str, object], name: str) -> List[str]:
    """Return the extras declared for one distribution, if any."""
    declared = extras.get(name)
    if declared is None:
        return []
    if not isinstance(declared, list):
        raise SystemExit(f"{PINS_PATH}: extras for '{name}' must be a list")
    return [str(item) for item in declared]


def torch_index_url(pins: Dict[str, object]) -> str:
    """Return the wheel index Torch is installed from (CPU wheels)."""
    return str(pins["torch_index_url"])


def protocol_version(pins: Dict[str, object]) -> str:
    """Return the WebSocket protocol version the pinned server speaks."""
    return str(pins["protocol_version"])


def pypi_requirements(pins: Dict[str, object]) -> List[str]:
    """Return ``name[extra]==version`` for every pinned distribution."""
    packages = _object_field(pins, "packages")
    extras = _object_field(pins, "extras")
    requirements = []
    for name, version in packages.items():
        declared = _extra_names(extras, name)
        suffix = f"[{','.join(declared)}]" if declared else ""
        requirements.append(f"{name}{suffix}=={version}")
    return requirements


def local_requirements(repo: Path) -> List[str]:
    """Return editable install arguments for a core-repository checkout."""
    requirements: List[str] = []
    for name, extra in LOCAL_DISTRIBUTIONS:
        package = repo / "packages" / name
        if not package.is_dir():
            raise SystemExit(
                f"{package} is missing -- is {repo} a spikeforge checkout?"
            )
        target = f"{package}[{extra}]" if extra else str(package)
        requirements.extend(["-e", target])
    return requirements
