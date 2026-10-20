#!/usr/bin/env bash
set -euo pipefail
version=$(node -p 'require("./package.json").version')
package="dist/Latitude-${version}-Linux-x64.flatpak"
test -s "$package"
flatpak install --user -y --noninteractive "$package"
app=studio.latitude.recorder
flatpak info --user "$app"
desktop="$HOME/.local/share/flatpak/exports/share/applications/$app.desktop"
desktop-file-validate "$desktop"
flatpak run --command=sh "$app" -c '
  set -eu
  base=/app/lib/studio.latitude.recorder
  test -s "$base/resources/app.asar"
  test -s "$base/resources/FFmpeg-LICENSE.txt"
  test -s "$base/resources/FFmpeg-README.txt"
  test -s "$base/resources/LINUX.md"
  test -s "$base/LICENSES.chromium.html"
  test -x "$base/resources/latitude-audio"
  "$base/resources/ffmpeg" -version
  ldd "$base/resources/latitude-audio"
'
# Launch from a different directory, with the normal Flatpak/Chromium sandbox.
cd /tmp
xvfb-run -a timeout 60s flatpak run --env=XDG_SESSION_TYPE=x11 "$app" --smoke-test
cd "$GITHUB_WORKSPACE/dist"
sha256sum "Latitude-${version}-Linux-x64.flatpak" | tee SHA256SUMS-Linux.txt
flatpak uninstall --user -y "$app"
