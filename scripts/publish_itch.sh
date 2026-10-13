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

# Butler's ZIP comparison tries to inspect archive members as filesystem paths.
# Give it extracted files so nested runtime packages and licenses stay intact.
windows_dir=$(mktemp -d "${TMPDIR:-/tmp}/spikeforge-itch-windows.XXXXXXXX")
trap 'rm -rf -- "$windows_dir"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
unzip -q "$windows_archive" -d "$windows_dir"

butler push --if-changed --fix-permissions --userversion "$version" \
  "$linux_archive" "$target:linux-x64"
butler push --if-changed --fix-permissions --userversion "$version" \
  "$windows_dir" "$target:windows-x64"
butler status "$target"
