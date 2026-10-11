"""Check runtime data retained by the frozen backend."""

from importlib.metadata import files


def _declared_targets() -> set[str]:
    """Read required cost tables from installed distribution metadata."""
    records = files("spikeforge-targets")
    if records is None:
        raise RuntimeError("Target distribution file metadata is missing")
    names = {
        path.stem for path in records
        if str(path).startswith("spikeforge_targets/energy/costs/")
        and path.suffix == ".json"
    }
    if not names:
        raise RuntimeError("Target metadata lists no energy cost tables")
    return names


def check_runtime_data() -> None:
    """Require declared cost tables and recorded package compatibility."""
    from spikeforge.version import compatibility_status
    from spikeforge_targets.energy import target_costs

    missing = sorted(_declared_targets() - set(target_costs.names()))
    if missing:
        raise RuntimeError("Missing declared energy cost tables: "
                           + ", ".join(missing))
    status = compatibility_status()
    if not status.startswith("compatibility: OK "):
        raise RuntimeError(f"Backend package compatibility failed: {status}")
