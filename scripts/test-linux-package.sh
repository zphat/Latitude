#!/usr/bin/env bash
set -euo pipefail
version=$(node -p 'require("./package.json").version')
package="dist/Latitude-${version}-Linux-x86_64.flatpak"
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
# Exercise the installed bridge -> Chromium device -> actual AudioWorklet path.
pulseaudio --start --exit-idle-time=-1
sink_module=$(pactl load-module module-null-sink sink_name=latitude_package_test rate=48000 channels=2)
pactl set-default-sink latitude_package_test
(ffmpeg -nostdin -v error -re -f lavfi -i sine=frequency=440:sample_rate=48000 -t 60 -ac 2 -f f32le - | paplay --device=latitude_package_test --raw --format=float32le --rate=48000 --channels=2) &
player=$!
trap 'kill "$player" 2>/dev/null || true; pactl unload-module "$sink_module" || true; pulseaudio --kill || true' EXIT
# Launch from a different directory, with the normal Flatpak/Chromium sandbox.
cd /tmp
xvfb-run -a timeout 60s flatpak run --env=XDG_SESSION_TYPE=x11 "$app" --smoke-test --audio-smoke-test
cd "$GITHUB_WORKSPACE/dist"
sha256sum "Latitude-${version}-Linux-x86_64.flatpak" | tee SHA256SUMS-Linux.txt
flatpak uninstall --user -y "$app"
