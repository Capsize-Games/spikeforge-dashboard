#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 USER/PROJECT RELEASE_DIRECTORY" >&2
  exit 2
fi

target=$1
release_dir=$2
version=$(node -p "require('./package.json').version")

# The Linux channel ships the tar.gz, not the bare AppImage. An AppImage
# downloaded through a browser arrives without its executable bit and fails
# with "Permission denied"; the tar records the mode, and the itch app
# unpacks it the same way it would any other archive.
linux_archive=$(find "$release_dir" -maxdepth 1 -type f -name '*.tar.gz' -print -quit)
# The Windows channel carries the zip, not the installer. The itch app
# unpacks an archive once and runs the executable directly, so there is no
# per-launch extraction; handing it a setup program would make every player
# run an installer through a game launcher.
windows_archive=$(find "$release_dir" -maxdepth 1 -type f -name '*windows*x64*.zip' -print -quit)

if [[ -z "$linux_archive" || -z "$windows_archive" ]]; then
  echo "expected Linux tar.gz and Windows zip in $release_dir" >&2
  exit 1
fi

# `--ignore` applies to the diff as well as the upload, and that is the point:
# butler patches the new build against the one already on the channel, and the
# bundled metadata licence trees (`<name>.dist-info/licenses/...`) make that
# diff fail with `lstat ...: not a directory`. The Windows channel sat on 0.2.4
# for two releases because of it, and every retry failed identically. The
# licence text still ships — the freeze re-roots it under `third_party_licenses/`
# (see scripts/build_desktop_backend.py) — so ignoring the old paths costs
# nothing and lets the patch complete.
butler push --if-changed --fix-permissions --userversion "$version" \
  --ignore '**/dist-info/licenses/**' \
  "$linux_archive" "$target:linux-x64"
butler push --if-changed --fix-permissions --userversion "$version" \
  --ignore '**/dist-info/licenses/**' \
  "$windows_archive" "$target:windows-x64"
butler status "$target"
