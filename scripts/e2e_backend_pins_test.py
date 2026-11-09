#!/usr/bin/env python3
"""The pins-to-pip mapping must keep backend provisioning installable.

Run with ``python3 scripts/e2e_backend_pins_test.py``; `npm run
scripts:test` runs it alongside the Node tooling tests.

The case that matters is the one that broke CI: `spikeforge` needs
`capsize-commons>=0.1.1`, but every published release of that
distribution is yanked, so resolving the range reports "from versions:
none" and the backend never installs. Pinning the yanked release exactly
is the one form pip still accepts, so the requirements must carry that
explicit pin.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Dict

# The pins helper is a sibling script, not an installed package, so the
# directory has to be importable before it can be loaded.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import e2e_backend_pins as pins


def example_pins() -> Dict[str, object]:
    """Return a pins file shaped like tests/e2e/backend-pins.json."""
    return {
        "protocol_version": "1.1",
        "packages": {
            "spikeforge": "0.6.0",
            "spikeforge-targets": "0.2.2",
        },
        "extras": {"spikeforge": ["nir"]},
        "torch_index_url": "https://download.pytorch.org/whl/cpu",
    }


class PypiRequirementsTest(unittest.TestCase):
    """Every pinned distribution must reach pip exactly as declared."""

    def test_pinned_packages_carry_their_extras(self) -> None:
        """Versions and extras from the pins file must survive mapping."""
        requirements = pins.pypi_requirements(example_pins())
        self.assertIn("spikeforge[nir]==0.6.0", requirements)
        self.assertIn("spikeforge-targets==0.2.2", requirements)

    def test_yanked_transitive_pin_is_exact(self) -> None:
        """A yanked release installs only when the requirement is exact."""
        matches = [
            item for item in pins.pypi_requirements(example_pins())
            if item.split("[", 1)[0].split("=", 1)[0].strip().lower()
            == "capsize-commons"
        ]
        self.assertEqual(len(matches), 1)
        name, separator, version = matches[0].partition("==")
        self.assertEqual(separator, "==")
        self.assertTrue(version and all(
            part.isdigit() for part in version.split(".")))

    def test_explicit_pin_is_not_duplicated(self) -> None:
        """A future pins entry for the same package must win, not clash."""
        declared = example_pins()
        packages = dict(declared["packages"])  # type: ignore[union-attr]
        packages["capsize-commons"] = "0.1.2"
        declared["packages"] = packages
        requirements = pins.pypi_requirements(declared)
        names = [
            item.split("[", 1)[0].split("=", 1)[0].strip().lower()
            for item in requirements
        ]
        self.assertEqual(names.count("capsize-commons"), 1)

    def test_real_pins_stay_provisionable(self) -> None:
        """The checked-in pins must map to requirements pip can resolve."""
        requirements = pins.pypi_requirements(pins.load_pins())
        self.assertIn("spikeforge[nir]==0.6.0", requirements)
        self.assertTrue(any(
            item.startswith("capsize-commons==") for item in requirements))


if __name__ == "__main__":
    unittest.main()
