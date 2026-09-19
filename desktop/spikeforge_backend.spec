# -*- mode: python ; coding: utf-8 -*-

from importlib.util import find_spec
from pathlib import Path

from PyInstaller.utils.hooks import (
    collect_data_files,
    collect_dynamic_libs,
    collect_submodules,
    copy_metadata,
)


datas = []
for distribution in (
    "spikeforge",
    "spikeforge-targets",
    "spikeforge-hub",
    "spikeforge-serve",
    "spikeforge-server",
    "snntorch",
    "torch",
    "torchvision",
):
    try:
        datas += copy_metadata(distribution)
    except Exception:
        pass

datas += collect_data_files("spikeforge_hub")

# PyInstaller records each distribution's metadata licence tree under
# ``<name>.dist-info/licenses/...``, and numpy's is nested several levels deep
# (``licenses/numpy/linalg/lapack_lite/LICENSE.txt``). butler compares the new
# Windows archive against the build already on the itch.io channel and fails
# the patch with ``lstat ...numpy/linalg: not a directory``, so the Windows
# channel never updates however many releases are cut.
#
# Moving every licence tree to a new top-level directory keeps all of the
# licence text in the bundle — the BSD notices have to ship — while removing
# the paths butler conflicts on. The distributions' METADATA and RECORD stay
# where ``importlib.metadata`` expects them.
_LICENCE_MARKER = ".dist-info/licenses/"


def relocate_licences(entries):
    """Re-root metadata licence trees under ``third_party_licenses``."""
    relocated = []
    for source, destination in entries:
        text = str(destination).replace("\\", "/")
        marker = text.find(_LICENCE_MARKER)
        if marker < 0:
            relocated.append((source, destination))
            continue
        distribution = text[:marker].rsplit("/", 1)[-1]
        tail = text[marker + len(_LICENCE_MARKER) :]
        relocated.append(
            (source, f"third_party_licenses/{distribution}/{tail}")
        )
    return relocated


datas = relocate_licences(datas)

hiddenimports = (
    collect_submodules("server")
    + collect_submodules("spikeforge")
    + collect_submodules("spikeforge_hub")
    + collect_submodules("spikeforge_targets")
    + [
        "spikeforge.data.download_cli",
        "spikeforge_hub.download_cli",
        "uvicorn.logging",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets.websockets_impl",
        "uvicorn.lifespan.on",
    ]
)

torchvision_spec = find_spec("torchvision")
torchvision_binaries = collect_dynamic_libs("torchvision")
if torchvision_spec and torchvision_spec.origin:
    torchvision_dir = Path(torchvision_spec.origin).parent
    torchvision_binaries += [
        (str(extension), "torchvision")
        for extension in torchvision_dir.glob("*_stable.*")
        if extension.is_file()
    ]

a = Analysis(
    ["backend_entry.py"],
    pathex=[],
    # torchvision 0.29 names its operator modules ``*_stable``; current
    # PyInstaller hooks still probe the historical ``_C``/``image`` names.
    binaries=torchvision_binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "uvloop", "httptools"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="spikeforge-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    # Electron launches this with windowsHide, while a console build keeps
    # startup exceptions visible to CI instead of blocking on a hidden dialog.
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="spikeforge-backend",
)
