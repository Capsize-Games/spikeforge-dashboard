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
windows_portable=$(find "$release_dir" -maxdepth 1 -type f -name '*windows*x64*portable.exe' -print -quit)

if [[ -z "$linux_archive" || -z "$windows_portable" ]]; then
  echo "expected Linux tar.gz and Windows portable executable in $release_dir" >&2
  exit 1
fi

butler push --if-changed --fix-permissions --userversion "$version" \
  "$linux_archive" "$target:linux-x64"
butler push --if-changed --fix-permissions --userversion "$version" \
  "$windows_portable" "$target:windows-x64"
butler status "$target"
