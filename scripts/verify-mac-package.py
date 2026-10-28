"""Verify and launch both DMG and ZIP app contents on the matching Mac runner."""
from pathlib import Path
import hashlib
import json
import os
import platform
import plistlib
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify():
    if platform.system() != "Darwin":
        raise RuntimeError("Native macOS package check required")
    arch = {"arm64": "arm64", "x86_64": "x64"}[platform.machine()]
    native = platform.machine()
    version = json.loads((ROOT / "package.json").read_text())["version"]
    dist = ROOT / "dist"
    stem = f"Latitude-{version}-macOS-{arch}"
    archive, dmg = dist / (stem + ".zip"), dist / (stem + ".dmg")
    source = dist / (stem + "-Encoder-Sources.tar.gz")
    for file in [archive, dmg, source]:
        if not file.is_file() or file.stat().st_size < 1_000_000:
            raise RuntimeError(f"Missing or truncated package: {file.name}")
    with zipfile.ZipFile(archive) as package:
        if package.testzip():
            raise RuntimeError("Corrupt app ZIP")
    with tempfile.TemporaryDirectory(prefix="latitude-package-") as temp:
        temp = Path(temp)
        subprocess.run(["ditto", "-xk", str(archive), str(temp / "unpacked")], check=True)
        app = temp / "unpacked/Latitude.app"
        info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
        assert info["CFBundleShortVersionString"] == version
        assert info["CFBundleIdentifier"] == "studio.latitude.recorder"
        assert info["LSMinimumSystemVersion"] == "14.2"
        for key in ["NSMicrophoneUsageDescription", "NSCameraUsageDescription", "NSAudioCaptureUsageDescription"]:
            assert len(info[key]) > 10
        resources = app / "Contents/Resources"
        assert (resources / "app.asar").stat().st_size > 100000
        assert digest(resources / "ffmpeg") == digest(ROOT / "vendor/ffmpeg")
        for notice in (ROOT / "vendor/mac").rglob("*"):
            if notice.is_file():
                assert digest(resources / "encoder-notices" / notice.relative_to(ROOT / "vendor/mac")) == digest(notice)
        for file in [app / "Contents/MacOS/Latitude", resources / "ffmpeg"]:
            assert native in subprocess.check_output(["lipo", "-archs", str(file)], text=True).split()
        # Run the packaged binary from an unrelated directory without capture permissions,
        # sandbox overrides, a source checkout or a developer encoder override.
        clean_env = {k: v for k, v in os.environ.items() if not k.startswith(("TAKE_", "LATITUDE_TEST", "ELECTRON_"))}
        subprocess.run([str(app / "Contents/MacOS/Latitude"), "--smoke-test"], cwd=temp,
                       env=clean_env, check=True, timeout=90)
        mount = temp / "mounted"
        mount.mkdir()
        subprocess.run(["hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", str(mount), str(dmg)], check=True)
        try:
            for file in ["Contents/Resources/app.asar", "Contents/Resources/ffmpeg", "Contents/Info.plist"]:
                assert digest(mount / "Latitude.app" / file) == digest(app / file)
            assert (mount / "Applications").is_symlink()
        finally:
            subprocess.run(["hdiutil", "detach", str(mount)], check=True)
    sums = "".join(f"{digest(f)}  {f.name}\n" for f in [dmg, archive, source])
    (dist / f"SHA256SUMS-macOS-{arch}.txt").write_text(sums)
    print(sums + "Verified native launch, architectures, DMG/ZIP equivalence, encoder and license files.")


if __name__ == "__main__":
    verify()
