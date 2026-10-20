const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
if (process.platform !== "linux") throw Error("Build the Linux audio bridge on Linux.");
const root = path.join(__dirname, "..");
fs.mkdirSync(path.join(root, "vendor"), { recursive: true });
const flags = execFileSync("pkg-config", ["--cflags", "--libs", "libpulse"], { encoding: "utf8" }).trim().split(/\s+/);
execFileSync(process.env.CC || "cc", ["-std=gnu11", "-O2", "-Wall", "-Wextra", "-Werror", "-fstack-protector-strong", "-D_FORTIFY_SOURCE=2", "-Wl,-z,relro,-z,now", path.join(root, "native/linux-audio.c"), "-o", path.join(root, "vendor/latitude-audio"), ...flags], { stdio: "inherit" });
console.log("Built vendor/latitude-audio (control only; audio stays in the server).");
