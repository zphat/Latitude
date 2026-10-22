#!/usr/bin/env bash
set -euo pipefail

# Only changes disposable GitHub runners, never a developer's package sources.
if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "This helper is only for GitHub Actions runners." >&2
  exit 1
fi
. /etc/os-release
if [[ "$ID" != "ubuntu" ]]; then
  echo "Expected an Ubuntu runner." >&2
  exit 1
fi

# The Azure mirror has stalled release jobs. Use Ubuntu's primary HTTPS
# archive, retaining the runner's suites, components, and signature checks.
sudo python3 - <<'PY'
from pathlib import Path

for name in ("/etc/apt/apt-mirrors.txt", "/etc/apt/sources.list",
             "/etc/apt/sources.list.d/ubuntu.sources"):
    path = Path(name)
    if not path.is_file():
        continue
    original = path.read_text()
    updated = original
    for scheme in ("http", "https"):
        updated = updated.replace(f"{scheme}://azure.archive.ubuntu.com/ubuntu",
                                  "https://archive.ubuntu.com/ubuntu")
    if updated != original:
        path.write_text(updated)
        print(f"Using the Ubuntu primary archive in {name}")
PY

sudo apt-get -o Acquire::Retries=3 update
