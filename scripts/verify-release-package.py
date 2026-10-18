"""Check a Windows release archive before publishing it. Uses Python stdlib only."""

from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
archive = root / "dist" / f"Latitude-{version}-Windows-x64.zip"

# Exact ffmpeg-static 5.3.0 / b6.1.1 Windows x64 encoder reviewed for this release.
# Update together with the build-specific source and license notices on upgrades.
encoder_sha256 = "04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00"

with zipfile.ZipFile(archive) as package:
    bad_entry = package.testzip()
    if bad_entry:
        raise RuntimeError(f"Corrupt ZIP entry: {bad_entry}")
    names = set(package.namelist())
    executables = [name for name in names if Path(name).name == "Latitude.exe"]
    if len(executables) != 1:
        raise RuntimeError("Expected exactly one Latitude.exe")
    prefix = executables[0][:-len("Latitude.exe")]
    required = [
        "Latitude.exe", "resources/app.asar", "resources/ffmpeg.exe",
        "resources/README.md", "resources/THIRD-PARTY-NOTICES.md",
        "resources/FFmpeg-LICENSE.txt", "resources/FFmpeg-README.txt",
        "LICENSE.electron.txt", "LICENSES.chromium.html",
        "resources.pak", "icudtl.dat", "locales/en-US.pak",
    ]
    missing = [name for name in required if prefix + name not in names]
    if missing:
        raise RuntimeError(f"Missing packaged files: {missing}")
    if package.read(prefix + "Latitude.exe")[:2] != b"MZ":
        raise RuntimeError("Not a Windows executable")
    encoder = package.read(prefix + "resources/ffmpeg.exe")
    if hashlib.sha256(encoder).hexdigest() != encoder_sha256:
        raise RuntimeError("Encoder differs from the reviewed build; review its notices before releasing")
    for name in ["FFmpeg-LICENSE.txt", "FFmpeg-README.txt"]:
        if package.read(prefix + "resources/" + name) != (root / "vendor" / name).read_bytes():
            raise RuntimeError(f"Packaged notice differs: {name}")
    if package.getinfo(prefix + "resources/app.asar").file_size < 100000:
        raise RuntimeError("Application archive is unexpectedly small")

with archive.open("rb") as stream:
    digest = hashlib.file_digest(stream, "sha256").hexdigest()
(archive.parent / "SHA256SUMS.txt").write_text(
    f"{digest}  {archive.name}\n", encoding="utf-8", newline="\n"
)
print(f"Verified package, runtime, encoder, and notices: {archive.name}")
print(f"SHA256 {digest}")
