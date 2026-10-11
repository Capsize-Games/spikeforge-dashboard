"""Exercise actual backend loaders in the freezer's collected data layout.

Run with the installed backend and PyInstaller before freezing the executable.
The child process imports copied package code, so checkout data cannot mask
missing runtime data in the spec's actual PyInstaller collection result.
"""

from __future__ import annotations

import ast
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from importlib.util import find_spec
from pathlib import Path
from typing import cast

SPEC = Path(__file__).resolve().parents[1] / "desktop/spikeforge_backend.spec"
EXPECTED = ["lava_loihi2", "norse", "reference", "speck", "spinnaker2", "xylo"]
PROBE = """
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[2])
sys.path.insert(0, sys.argv[1])
from spikeforge_targets.energy import target_costs
from spikeforge_targets.energy.accounting import account
from spikeforge import version
assert Path(target_costs.__file__).is_relative_to(sys.argv[1])
assert Path(version.__file__).is_relative_to(sys.argv[1])
report = account({'sop': 1, 'mac': 1, 'ac': 1, 'timesteps': 1}, 'reference')
print(json.dumps({'names': target_costs.names(), 'basis': report.basis,
                  'energy': report.energy,
                  'compatibility': version.compatibility_status()}))
"""


def collected_data() -> list[tuple[str, str]]:
    """Run the spec's actual data declarations with PyInstaller collectors."""
    nodes = []
    for node in ast.parse(SPEC.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "hiddenimports"
            for t in node.targets
        ):
            break
        nodes.append(node)
    namespace: dict[str, object] = {}
    program = ast.Module(body=nodes, type_ignores=[])
    exec(compile(program, str(SPEC), "exec"), namespace)
    return cast(list[tuple[str, str]], namespace["datas"])


def installed_package(name: str) -> Path:
    """Locate installed code without substituting a fixture implementation."""
    found = find_spec(name)
    if found is None or found.origin is None:
        raise RuntimeError(f"backend package is not installed: {name}")
    return Path(found.origin).parent


def copy_code(bundle: Path, name: str) -> None:
    """Copy Python code while data comes solely from the spec's TOC."""
    package = installed_package(name)
    for source in package.rglob("*.py"):
        target = bundle / name / source.relative_to(package)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def copy_data(bundle: Path) -> None:
    """Materialize data destinations exactly as the freezer lays them out."""
    for source_name, destination in collected_data():
        source = Path(source_name)
        target = bundle / destination
        target.mkdir(parents=True, exist_ok=True)
        if source.is_dir():
            shutil.copytree(source, target, dirs_exist_ok=True)
        else:
            shutil.copy2(source, target / source.name)


def probe(bundle: Path) -> dict[str, object]:
    """Call real loaders in an isolated interpreter using the frozen layout."""
    dependencies = installed_package("spikeforge").parent
    result = subprocess.run(
        [sys.executable, "-I", "-c", PROBE, str(bundle), str(dependencies)],
        text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr)
    return cast(dict[str, object], json.loads(result.stdout))


class FrozenDataTest(unittest.TestCase):
    """A healthy backend must retain declared energy and version evidence."""

    @classmethod
    def setUpClass(cls) -> None:
        """Construct one real collected layout outside the source checkout."""
        temporary = tempfile.TemporaryDirectory(prefix="frozen-data-test-")
        cls.addClassCleanup(temporary.cleanup)
        bundle = Path(temporary.name)
        for name in ("spikeforge", "spikeforge_targets"):
            copy_code(bundle, name)
        copy_data(bundle)
        cls.actual = probe(bundle)

    def test_declared_energy_survives_freezing(self) -> None:
        """The desktop's accounting path must retain its declared estimates."""
        self.assertEqual(self.actual["names"], EXPECTED)
        self.assertEqual(self.actual["basis"], "declared cost table")
        self.assertIsNotNone(self.actual["energy"])

    def test_recorded_compatibility_survives_freezing(self) -> None:
        """The shipped combination must retain its compatibility evidence."""
        self.assertEqual(self.actual["compatibility"],
                         "compatibility: OK (a recorded release combination)")


if __name__ == "__main__":
    unittest.main()
