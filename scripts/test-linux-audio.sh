#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR
XDG_RUNTIME_DIR=$(mktemp -d)
chmod 700 "$XDG_RUNTIME_DIR"
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  rm -rf "$XDG_RUNTIME_DIR"
}
trap cleanup EXIT
if [[ "${LATITUDE_AUDIO_SERVER:-pulseaudio}" == pipewire ]]; then
  pipewire > "$XDG_RUNTIME_DIR/pipewire.log" 2>&1 & pids+=("$!")
  wireplumber > "$XDG_RUNTIME_DIR/wireplumber.log" 2>&1 & pids+=("$!")
  pipewire-pulse > "$XDG_RUNTIME_DIR/pulse.log" 2>&1 & pids+=("$!")
else
  pulseaudio --daemonize=no --exit-idle-time=-1 > "$XDG_RUNTIME_DIR/pulse.log" 2>&1 & pids+=("$!")
fi
for attempt in {1..50}; do
  if pactl info >/dev/null 2>&1; then break; fi
  sleep .1
done
pactl info
timeout 45s node tests/linux-native.cjs
