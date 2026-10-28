"""Build the Mac encoder from pinned sources; no Homebrew runtime libraries.

Requires Xcode command-line tools, make, nasm and pkg-config on a native Mac.
The source archives and this recipe accompany the downloadable binaries.
"""
from pathlib import Path
import hashlib
import json
import os
import platform
import shutil
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def build():
    if platform.system() != "Darwin":
        raise RuntimeError("Build on macOS, once per native architecture")
    arch = {"arm64": "arm64", "x86_64": "x64"}[platform.machine()]
    work = ROOT / ".mac-encoder-build" / arch
    prefix = work / "prefix"
    bundle = work / "sources"
    bundle.mkdir(parents=True, exist_ok=True)
    manifest = ROOT / "packaging/mac/encoder-sources.json"
    sources = json.loads(manifest.read_text())
    dirs = {}
    for source in sources:
        archive = bundle / source["file"]
        if not archive.exists():
            urllib.request.urlretrieve(source["url"], archive)
        if hashlib.file_digest(archive.open("rb"), "sha256").hexdigest() != source["sha256"]:
            raise RuntimeError(f"Source checksum mismatch: {source['name']}")
        with tarfile.open(archive) as tar:
            tar.extractall(work, filter="data")
        dirs[source["name"]] = work / source["root"]

    env = {**os.environ, "MACOSX_DEPLOYMENT_TARGET": "14.2",
           "CFLAGS": "-O2 -mmacosx-version-min=14.2",
           "CXXFLAGS": "-O2 -mmacosx-version-min=14.2",
           "LDFLAGS": "-mmacosx-version-min=14.2",
           "PKG_CONFIG_LIBDIR": str(prefix / "lib/pkgconfig"), "PKG_CONFIG_PATH": ""}
    jobs = str(min(os.cpu_count() or 2, 8))
    commands = []

    def run(name, *args):
        commands.append({"source": name, "argv": list(args)})
        subprocess.run(args, cwd=dirs[name], env=env, check=True)

    def install(name, *options):
        run(name, "./configure", f"--prefix={prefix}", *options)
        run(name, "make", f"-j{jobs}")
        run(name, "make", "install")

    install("x264", "--enable-static", "--enable-pic", "--disable-cli")
    install("libvpx", "--enable-static", "--disable-shared", "--enable-pic",
            "--disable-tools", "--disable-examples", "--disable-unit-tests",
            "--enable-vp9-highbitdepth",
            "--target=" + ("arm64-darwin-gcc" if arch == "arm64" else "x86_64-darwin20-gcc"))
    install("opus", "--enable-static", "--disable-shared", "--with-pic",
            "--disable-extra-programs", "--disable-doc")
    install("lame", "--enable-static", "--disable-shared", "--with-pic", "--disable-frontend",
            "--build=" + ("aarch64-apple-darwin" if arch == "arm64" else "x86_64-apple-darwin"))
    install("ffmpeg", "--disable-autodetect", "--disable-doc", "--disable-debug",
            "--disable-ffplay", "--disable-shared", "--enable-static", "--enable-gpl",
            "--enable-libx264", "--enable-libvpx", "--enable-libopus", "--enable-libmp3lame",
            "--enable-videotoolbox", "--enable-audiotoolbox", "--enable-securetransport",
            "--enable-zlib", "--disable-bzlib", "--disable-lzma", "--pkg-config-flags=--static",
            f"--extra-cflags=-I{prefix / 'include'} -mmacosx-version-min=14.2",
            f"--extra-ldflags=-L{prefix / 'lib'} -mmacosx-version-min=14.2")

    notices = ROOT / "vendor/mac"
    notices.mkdir(parents=True, exist_ok=True)
    for executable in ["ffmpeg", "ffprobe"]:
        shutil.copy2(prefix / "bin" / executable, ROOT / "vendor" / executable)
    for name, directory in dirs.items():
        target = notices / name
        target.mkdir(exist_ok=True)
        for pattern in ["COPYING*", "LICENSE*", "PATENTS", "AUTHORS", "README*"]:
            for file in directory.glob(pattern):
                if file.is_file():
                    shutil.copy2(file, target / file.name)
    shutil.copy2(manifest, bundle / manifest.name)
    shutil.copy2(__file__, bundle / Path(__file__).name)
    info = {"arch": arch, "minimum_macos": "14.2", "source_commit": os.getenv("GITHUB_SHA", "local"),
            "sources": sources, "commands": commands,
            "compiler": subprocess.check_output(["clang", "--version"], text=True),
            "encoder_sha256": hashlib.file_digest((ROOT / "vendor/ffmpeg").open("rb"), "sha256").hexdigest()}
    for directory in [notices, bundle]:
        (directory / "BUILD.json").write_text(json.dumps(info, indent=2) + "\n")
    (notices / "README.txt").write_text(
        "Latitude uses a separate GPL FFmpeg 6.1.6 executable with x264, libvpx, Opus and LAME.\n"
        "No nonfree components are enabled. License texts are in each component directory.\n"
        "The exact unmodified sources, hashes and build recipe accompany this release as\n"
        "Latitude-VERSION-macOS-ARCH-Encoder-Sources.tar.gz at\n"
        "https://github.com/zphat/Latitude/releases . BUILD.json records this build.\n")
    version = json.loads((ROOT / "package.json").read_text())["version"]
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    with tarfile.open(dist / f"Latitude-{version}-macOS-{arch}-Encoder-Sources.tar.gz", "w:gz") as tar:
        tar.add(bundle, arcname="encoder-sources")


if __name__ == "__main__":
    build()
