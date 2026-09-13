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
    console=False,
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
