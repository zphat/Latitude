"""Add verified Mac previews to an existing beta; never replace release assets."""
from pathlib import Path
import hashlib
import json
import os
import subprocess

ROOT = Path(__file__).resolve().parent.parent


def gh(*args):
    return subprocess.check_output(["gh", *args], text=True)


def publish():
    version = json.loads((ROOT / "package.json").read_text())["version"]
    tag = "v" + version
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    title = event["head_commit"]["message"].splitlines()[0]
    if title not in [f"Publish Latitude macOS preview {tag}", f"Release Latitude {tag}"]:
        raise RuntimeError("Publication requires an explicit matching commit title")
    repo = os.environ["GH_REPO"]
    release = json.loads(gh("api", f"repos/{repo}/releases/tags/{tag}"))
    if release["draft"] or not release["prerelease"]:
        raise RuntimeError("Mac development previews may only join an existing published beta")
    if title == f"Release Latitude {tag}":
        # The shared concurrency group lets Windows/Linux publish first. A new
        # multi-platform release must refer to this exact tested source commit.
        tagged = json.loads(gh("api", f"repos/{repo}/commits/{tag}"))
        if tagged["sha"] != os.environ["GITHUB_SHA"]:
            raise RuntimeError("Release tag does not match the tested Mac commit")
    assets = ROOT / "release-assets"
    checksums = {}
    for arch in ["arm64", "x64"]:
        expected = {f"Latitude-{version}-macOS-{arch}{ext}" for ext in [".dmg", ".zip", "-Encoder-Sources.tar.gz"]}
        found = {}
        for line in (assets / f"SHA256SUMS-macOS-{arch}.txt").read_text().splitlines():
            checksum, name = line.split("  ", 1)
            if name not in expected or name in found:
                raise RuntimeError("Unexpected or duplicate Mac checksum entry")
            with (assets / name).open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != checksum:
                    raise RuntimeError(f"Mac artifact checksum mismatch: {name}")
            found[name] = checksum
        if set(found) != expected:
            raise RuntimeError("Incomplete Mac artifact set")
        checksums.update(found)
    manifest = assets / "SHA256SUMS-macOS.txt"
    manifest.write_text("".join(f"{value}  {key}\n" for key, value in sorted(checksums.items())))
    checksums[manifest.name] = hashlib.sha256(manifest.read_bytes()).hexdigest()
    existing = {a["name"]: a for a in release["assets"]}
    # Resume interrupted uploads only when existing files have exactly the same digest.
    for name, checksum in checksums.items():
        if name in existing:
            if existing[name].get("digest") != "sha256:" + checksum:
                raise RuntimeError(f"Existing asset differs; refusing to replace {name}")
        else:
            gh("release", "upload", tag, str(assets / name))
    after = json.loads(gh("api", f"repos/{repo}/releases/tags/{tag}"))
    uploaded = {a["name"]: a for a in after["assets"]}
    for name, checksum in checksums.items():
        if uploaded[name].get("digest") != "sha256:" + checksum:
            raise RuntimeError(f"Uploaded asset digest mismatch: {name}")
    for name, previous in existing.items():
        if (uploaded[name]["id"], uploaded[name].get("digest")) != (previous["id"], previous.get("digest")):
            raise RuntimeError("An existing release asset changed")
    gh("release", "edit", tag, "--title", f"Latitude {version} — Windows beta, Linux + Mac previews",
       "--notes-file", str(ROOT / "docs/releases" / (version + ".md")))
    print(f"Published both Mac architectures for {tag}; previous downloads and checksums retained.")


if __name__ == "__main__":
    publish()
