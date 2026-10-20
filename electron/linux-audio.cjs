const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { randomBytes } = require("node:crypto");

class LinuxAudio {
  constructor(
    binary,
    {
      spawnProcess = spawn,
      run = promisify(execFile),
      onDisconnect = () => {},
      timeout = 12000,
    } = {},
  ) {
    Object.assign(this, { binary, spawnProcess, run, onDisconnect, timeout });
    this.queue = Promise.resolve();
  }
  async outputs() {
    const { stdout } = await this.run(this.binary, ["list"], {
      timeout: this.timeout,
      maxBuffer: 256 * 1024,
    });
    const outputs = JSON.parse(stdout);
    if (
      !Array.isArray(outputs) ||
      outputs.some(
        (o) => typeof o.name !== "string" || typeof o.description !== "string",
      )
    )
      throw Error("Invalid audio output list.");
    return outputs;
  }
  connect(sink = "default") {
    if (
      typeof sink !== "string" ||
      !sink ||
      sink.length > 1024 ||
      /[\x00-\x1f]/.test(sink)
    )
      return Promise.reject(Error("Invalid audio output."));
    const operation = this.queue.then(async () => {
      if (this.active?.sink === sink && this.active.ready)
        return this.active.ready;
      await this.stopActive();
      const label = `latitude_desktop_${randomBytes(8).toString("hex")}`;
      const child = this.spawnProcess(this.binary, ["bridge", sink, label], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      const active = (this.active = { child, sink, expected: false });
      active.closed = new Promise((resolve) => child.once("close", resolve));
      let errorText = "",
        output = "";
      child.stderr.on("data", (b) => {
        errorText = (errorText + b).slice(-4096);
      });
      // EPIPE is expected if the server disappears before the shutdown request.
      child.stdin.on("error", () => {});
      return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (message) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(Error(message));
        };
        const timer = setTimeout(() => {
          fail(
            "Desktop audio timed out. Check that PipeWire or PulseAudio is running.",
          );
          this.stopActive().catch(() => {});
        }, this.timeout);
        child.once("error", (e) =>
          fail(`Desktop audio bridge unavailable: ${e.message}`),
        );
        child.once("close", () => {
          clearTimeout(timer);
          if (this.active === active) this.active = null;
          if (!settled)
            fail(errorText.trim() || "Desktop audio could not connect.");
          else if (active.ready && !active.expected)
            this.onDisconnect(
              "Desktop audio disconnected. Reconnect it in Inputs & outputs.",
            );
        });
        child.stdout.on("data", (bytes) => {
          if (settled) return;
          output += bytes;
          if (output.length > 8192) {
            fail("Invalid desktop audio response.");
            this.stopActive().catch(() => {});
            return;
          }
          if (!output.includes("\n")) return;
          try {
            const result = JSON.parse(output.slice(0, output.indexOf("\n")));
            if (result.label !== label || result.sourceName !== label)
              throw Error("Invalid desktop audio identity.");
            active.ready = result;
            settled = true;
            clearTimeout(timer);
            resolve(result);
          } catch (e) {
            fail(e.message);
            this.stopActive().catch(() => {});
          }
        });
      });
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  stop() {
    const operation = this.queue.then(() => this.stopActive());
    this.queue = operation.catch(() => {});
    return operation;
  }
  async stopActive() {
    const active = this.active;
    if (!active) return;
    active.expected = true;
    active.child.stdin.end(); // EOF also cleans up after a parent crash.
    let timer;
    await Promise.race([
      active.closed,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          active.child.kill();
          resolve();
        }, 2500);
      }),
    ]);
    clearTimeout(timer);
    if (this.active === active) this.active = null;
  }
}
module.exports = { LinuxAudio };
