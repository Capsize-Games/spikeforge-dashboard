#!/usr/bin/env python3
"""The provisioner's idempotency record must never outrun verification.

Run with ``python3 scripts/provision_e2e_backend_test.py``; `npm run
scripts:test` runs it alongside the Node tooling tests.

The case that matters is the one that used to be wrong: the stamp was written
straight after installation, so a failed verification left a success-looking
marker. The next run matched it, reported "already provisioned", and skipped
verification entirely -- converting a loud provisioning failure into a server
that fails to start minutes later.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

# The provisioner and its helpers are sibling scripts, not an installed
# package, so the directory has to be importable before they can be loaded.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import e2e_backend_stamp as stamp
import provision_e2e_backend as provisioner


class StampTest(unittest.TestCase):
    """The stamp file's own read/write/clear contract."""

    def setUp(self) -> None:
        """Give each test an empty environment directory."""
        self._tmp = tempfile.TemporaryDirectory()
        self.venv = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_absent_stamp_reads_as_none(self) -> None:
        """A directory with no stamp has nothing to match against."""
        self.assertIsNone(stamp.read(self.venv))

    def test_a_written_stamp_round_trips(self) -> None:
        """What was written is what a later run compares against."""
        wanted = {"source": "pypi", "packages": {"spikeforge": "0.5.0"}}
        stamp.write(self.venv, wanted)
        self.assertEqual(stamp.read(self.venv), wanted)

    def test_a_truncated_stamp_does_not_match(self) -> None:
        """Unparseable content reads as absent rather than raising."""
        (self.venv / stamp.STAMP_NAME).write_text("{not json", encoding="utf-8")
        self.assertIsNone(stamp.read(self.venv))

    def test_clear_removes_it_and_tolerates_absence(self) -> None:
        """Clearing is safe to call whether or not a stamp exists."""
        stamp.write(self.venv, {"source": "pypi"})
        stamp.clear(self.venv)
        self.assertIsNone(stamp.read(self.venv))
        stamp.clear(self.venv)


class FailedVerificationTest(unittest.TestCase):
    """A provision that fails verification must not look like a success."""

    def setUp(self) -> None:
        """Stand up a fake environment and record what the provisioner runs."""
        self._tmp = tempfile.TemporaryDirectory()
        self.venv = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        self.installs = 0
        self.verifications = 0

        python = provisioner.venv_python(self.venv)
        python.parent.mkdir(parents=True, exist_ok=True)
        python.touch()

        def fake_ensure_venv(venv_dir: Path, force: bool) -> Path:
            return provisioner.venv_python(venv_dir)

        def fake_install(*_args: object) -> None:
            self.installs += 1

        def fake_verify(*_args: object) -> None:
            self.verifications += 1
            if self.fail_verification:
                raise RuntimeError("import failed")

        self.fail_verification = True
        self._swap("_ensure_venv", fake_ensure_venv)
        self._swap("_install", fake_install)
        self._swap("_verify", fake_verify)
        self._swap("load_pins", lambda: {"packages": {"spikeforge": "0.5.0"}})

    def _swap(self, name: str, replacement: object) -> None:
        """Replace one provisioner attribute for the duration of a test."""
        original = getattr(provisioner, name)
        setattr(provisioner, name, replacement)
        self.addCleanup(setattr, provisioner, name, original)

    def _provision(self) -> None:
        """Run the provisioner against the fake environment."""
        provisioner.provision(self.venv, "pypi", None, False)

    def test_a_failed_verification_leaves_no_stamp(self) -> None:
        """The failure surfaces, and nothing records a success."""
        with self.assertRaises(RuntimeError):
            self._provision()
        self.assertIsNone(stamp.read(self.venv))

    def test_the_next_run_retries_instead_of_short_circuiting(self) -> None:
        """A second invocation must install and verify again, not skip."""
        with self.assertRaises(RuntimeError):
            self._provision()
        self.assertEqual((self.installs, self.verifications), (1, 1))

        # Same inputs, same directory: the old code reported "already
        # provisioned" here and never retried.
        self.fail_verification = False
        self._provision()
        self.assertEqual((self.installs, self.verifications), (2, 2))
        self.assertIsNotNone(stamp.read(self.venv))

    def test_a_stale_stamp_is_cleared_before_a_refresh(self) -> None:
        """A previous, different install cannot survive a failed refresh."""
        stamp.write(self.venv, {"source": "pypi", "packages": {"x": "1"}})
        with self.assertRaises(RuntimeError):
            self._provision()
        self.assertIsNone(stamp.read(self.venv))

    def test_a_verified_install_is_reused(self) -> None:
        """The idempotency the stamp exists for still works."""
        self.fail_verification = False
        self._provision()
        self._provision()
        self.assertEqual((self.installs, self.verifications), (1, 1))


if __name__ == "__main__":
    unittest.main(verbosity=2)
