import { PRESETS } from "../audio/dsp.js";
import { OutputExtensions } from "./extensions.js";

export class StudioEngine extends EventTarget {
  constructor(canvas, compositor) {
    super();
    this.outputs = new OutputExtensions(this);
    this.canvas = canvas;
    this.compositor = compositor;
    this.streams = {};
    this.nodes = {};
    this.voiceSettings = [
      { ...PRESETS.natural, channel: "left", syncMs: 0 },
      { ...PRESETS.natural, channel: "left", syncMs: 0 },
    ];
    this.desktopSettings = { gain: -6, mute: false, duck: false, syncMs: 0 };
    this.masterSettings = { gain: 0, mute: false };
    this.recording = false;
    this.finishing = false;
    this.queue = Promise.resolve();
    this.pendingBytes = 0;
    this.elapsed = 0;
    this.outputDevice = "";
    this.monitored = false;
    this.paused = false;
    this.pausedTime = 0;
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  async init() {
    if (!this.initializing)
      this.initializing = this.initialize().catch(async (error) => {
        await this.ctx?.close().catch(() => {});
        this.ctx = this.node = this.initializing = null;
        throw error;
      });
    await this.initializing;
    await this.ctx.resume();
    this.updateIdle();
  }
  updateIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (
        this.ctx?.state === "running" &&
        !this.recording &&
        !this.finishing &&
        !this.starting &&
        !this.monitored &&
        !Object.keys(this.nodes).length
      )
        this.ctx.suspend().catch(() => {});
    }, 200);
  }
  async initialize() {
    this.ctx = new AudioContext({
      sampleRate: 48000,
      latencyHint: "interactive",
    });
    await this.ctx.audioWorklet.addModule(
      new URL("../audio/studio-worklet.js", import.meta.url),
    );
    this.node = new AudioWorkletNode(this.ctx, "take-studio", {
      numberOfInputs: 3,
      numberOfOutputs: 2,
      outputChannelCount: [2, 2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    this.node.onprocessorerror = () => {
      this.emit(
        "error",
        "The audio processor stopped. Save this take, then restart the application.",
      );
      if (this.recording)
        this.stop().catch((e) => this.emit("error", e.message));
    };
    this.silent = this.ctx.createGain();
    this.silent.gain.value = 0;
    this.node.connect(this.silent);
    this.silent.connect(this.ctx.destination);
    this.mixDestination = this.ctx.createMediaStreamDestination();
    this.node.connect(this.mixDestination, 0);
    this.monitorDestination = this.ctx.createMediaStreamDestination();
    this.node.connect(this.monitorDestination, 1);
    this.monitor = new Audio();
    this.monitor.srcObject = this.monitorDestination.stream;
    this.monitor.volume = 0.7;
    this.node.port.onmessage = ({ data }) => {
      if (data.type === "meters") this.emit("meters", data);
      if (data.type === "pcm" && this.session) {
        const keys = ["voice1", "voice2", "desktop", "mix", "raw1", "raw2"];
        data.data.forEach((b, i) => {
          if (b && this.activeTracks?.has(keys[i]))
            this.enqueue(keys[i], b.buffer);
        });
      }
      if (data.type === "stopped") this.stopResolve?.();
    };
    for (let i = 0; i < 2; i++) this.setVoice(i, this.voiceSettings[i]);
    this.setDesktop(this.desktopSettings);
    this.setMaster(this.masterSettings);
    this.ctx.onstatechange = () => {
      this.emit("sources", this.sourceState());
      if (this.recording && this.ctx.state !== "running") {
        this.emit(
          "error",
          "The audio engine was suspended. The take is being saved.",
        );
        this.stop().catch((e) => this.emit("error", e.message));
      }
    };
    await this.ctx.resume();
  }
  async devices() {
    return navigator.mediaDevices.enumerateDevices();
  }
  async attach(key, stream, input) {
    await this.init();
    const old = this.streams[key];
    this.nodes[key]?.disconnect();
    this.streams[key] = stream;
    this.nodes[key] = this.ctx.createMediaStreamSource(stream);
    this.nodes[key].connect(this.node, 0, input);
    if (old && old !== stream) old.getTracks().forEach((t) => t.stop());
    for (const t of stream.getAudioTracks())
      t.onended = () => {
        if (this.streams[key] === stream) {
          delete this.streams[key];
          this.nodes[key]?.disconnect();
          delete this.nodes[key];
          this.updateIdle();
          this.emit("sources", this.sourceState());
          this.emit(
            "error",
            `${key === "desktop" ? "Desktop audio" : key === "mic1" ? "Voice 1" : "Voice 2"} disconnected. Its track will contain silence until reconnected.`,
          );
        }
      };
    this.emit("sources", this.sourceState());
  }
  async mic(index, deviceId, noiseSuppression = false) {
    if (this.recording || this.finishing || this.starting)
      throw Error("Change input devices between takes.");
    if (deviceId === "off") {
      this.remove(`mic${index + 1}`);
      return;
    }
    const otherStream = this.streams[`mic${index === 0 ? 2 : 1}`],
      otherSettings = otherStream?.getAudioTracks()[0]?.getSettings(),
      other = otherSettings?.deviceId;
    const stream =
      other &&
      deviceId &&
      deviceId === other &&
      !!otherSettings.noiseSuppression === noiseSuppression
        ? otherStream.clone()
        : await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: deviceId ? { exact: deviceId } : undefined,
              echoCancellation: false,
              autoGainControl: false,
              noiseSuppression,
              channelCount: { ideal: 2 },
              sampleRate: { ideal: 48000 },
            },
            video: false,
          });
    if (this.recording || this.finishing || this.starting) {
      stream.getTracks().forEach((t) => t.stop());
      throw Error(
        "Recording started while the device was connecting. Try again between takes.",
      );
    }
    await this.attach(`mic${index + 1}`, stream, index);
  }
  remove(key) {
    this.nodes[key]?.disconnect();
    this.streams[key]?.getTracks().forEach((t) => t.stop());
    delete this.streams[key];
    delete this.nodes[key];
    this.updateIdle();
    this.emit("sources", this.sourceState());
  }
  async screen(source, desktopMode = "system", slot = "a") {
    const key = slot === "b" ? "screenB" : "screen";
    if (this.recording || this.finishing || this.starting)
      throw Error("Change capture devices between takes.");
    await this.init();
    if (window.take && source) await window.take.chooseSource(source);
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: this.compositor.outputWidth },
        height: { ideal: this.compositor.outputHeight },
        frameRate: { ideal: this.compositor.fps, max: this.compositor.fps },
      },
      audio: slot === "a" && desktopMode === "system",
      systemAudio: "include",
    });
    if (this.recording || this.finishing || this.starting) {
      stream.getTracks().forEach((t) => t.stop());
      throw Error(
        "Recording started while the screen was connecting. Try again between takes.",
      );
    }
    this.streams[key]?.getTracks().forEach((t) => t.stop());
    this.streams[key] = stream;
    this.compositor.setScreen(stream, slot);
    if (slot === "a") this.desktopMode = desktopMode;
    if (slot === "a" && desktopMode === "system") {
      this.remove("desktop");
      if (stream.getAudioTracks().some((t) => t.readyState === "live"))
        await this.attach(
          "desktop",
          new MediaStream(stream.getAudioTracks()),
          2,
        );
      else
        this.emit(
          "error",
          "Screen connected without desktop audio. Choose a loopback / virtual-cable input, or share a screen with system audio enabled.",
        );
    }
    stream.getVideoTracks()[0].onended = () => {
      if (this.streams[key] === stream) {
        delete this.streams[key];
        this.compositor.setScreen(null, slot);
        this.emit("sources", this.sourceState());
        this.emit(
          "error",
          "Screen capture ended. Other sources are still recording.",
        );
      }
    };
    this.emit("sources", this.sourceState());
  }
  async desktopInput(deviceId) {
    if (this.recording || this.finishing || this.starting)
      throw Error("Change desktop audio devices between takes.");
    if (deviceId === "off") {
      this.remove("desktop");
      this.desktopMode = "off";
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
        channelCount: 2,
      },
      video: false,
    });
    if (this.recording || this.finishing || this.starting) {
      stream.getTracks().forEach((t) => t.stop());
      throw Error(
        "Recording started while the device was connecting. Try again between takes.",
      );
    }
    await this.attach("desktop", stream, 2);
    this.desktopMode = "input";
  }
  async camera(deviceId) {
    if (this.recording || this.finishing || this.starting)
      throw Error("Change camera devices between takes.");
    if (deviceId === "off") {
      this.streams.camera?.getTracks().forEach((t) => t.stop());
      delete this.streams.camera;
      this.compositor.setCamera(null);
      this.emit("sources", this.sourceState());
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: this.compositor.outputWidth },
        height: { ideal: this.compositor.outputHeight },
        frameRate: { ideal: this.compositor.fps, max: this.compositor.fps },
      },
      audio: false,
    });
    if (this.recording || this.finishing || this.starting) {
      stream.getTracks().forEach((t) => t.stop());
      throw Error(
        "Recording started while the camera was connecting. Try again between takes.",
      );
    }
    this.streams.camera?.getTracks().forEach((t) => t.stop());
    this.streams.camera = stream;
    this.compositor.setCamera(stream);
    stream.getVideoTracks()[0].onended = () => {
      if (this.streams.camera === stream) {
        delete this.streams.camera;
        this.compositor.setCamera(null);
        this.emit("sources", this.sourceState());
        this.emit("error", "Camera disconnected. Check its connection.");
      }
    };
    this.emit("sources", this.sourceState());
  }
  sourceState() {
    return {
      mic1: !!this.streams.mic1,
      mic2: !!this.streams.mic2,
      desktop: !!this.streams.desktop,
      screen: !!this.streams.screen,
      screenB: !!this.streams.screenB,
      camera: !!this.streams.camera,
    };
  }
  setVoice(index, settings) {
    Object.assign(this.voiceSettings[index], settings);
    this.node?.port.postMessage({ type: "voice", index, settings });
  }
  setDesktop(settings) {
    Object.assign(this.desktopSettings, settings);
    this.node?.port.postMessage({ type: "desktop", settings });
  }
  setMaster(settings) {
    Object.assign(this.masterSettings, settings);
    this.node?.port.postMessage({ type: "master", settings });
  }
  async output(deviceId) {
    this.outputDevice = deviceId;
    await this.init();
    if (typeof this.monitor.setSinkId === "function")
      await this.monitor.setSinkId(deviceId);
    else if (deviceId)
      throw Error("Output-device selection is not supported by this runtime.");
  }
  async listen(enabled) {
    await this.init();
    if (
      enabled &&
      this.recording &&
      this.desktopMode === "system" &&
      this.streams.desktop
    )
      throw Error(
        "Use interface direct monitoring while recording system audio. Software monitoring would be captured again.",
      );
    if (enabled) {
      await this.output(this.outputDevice);
      await this.monitor.play();
    } else this.monitor.pause();
    this.monitored = enabled;
    this.node.port.postMessage({ type: "monitor", enabled });
    this.updateIdle();
    this.emit("monitor", enabled);
  }
  enqueue(key, buffer) {
    if (!this.session) return;
    this.pendingBytes += buffer.byteLength;
    const id = this.session.id;
    if (
      this.pendingBytes + (this.pendingBlobBytes || 0) > 64 * 1024 * 1024 &&
      !this.ioFailed
    ) {
      this.ioFailed = true;
      this.emit(
        "error",
        "Storage cannot keep up. Stopping to preserve this take.",
      );
      this.stop().catch(() => {});
    }
    this.queue = this.queue
      .then(() => window.take.chunk(id, key, buffer))
      .catch((error) => {
        if (!this.ioFailed) {
          this.ioFailed = true;
          this.emit("error", `Recording stopped: ${error.message}`);
          queueMicrotask(() => this.stop().catch(() => {}));
        }
      })
      .finally(() => {
        this.pendingBytes -= buffer.byteLength;
      });
  }
  async start(options) {
    if (this.recording || this.finishing || this.starting) return;
    this.starting = true;
    try {
      return await this.startRecording(options);
    } finally {
      this.starting = false;
      this.updateIdle();
    }
  }
  async startRecording(options) {
    if (!window.take)
      throw Error(
        "Recording to disk is available in the desktop app. This browser preview is for setup and interface testing.",
      );
    await this.init();
    const state = this.sourceState();
    if (
      !Object.values(state).some(Boolean) &&
      !this.compositor.getLayers().some((l) => l.visible && l.type !== "video")
    )
      throw Error(
        "Connect a screen, camera, microphone, or add a visual layer first.",
      );
    if (this.desktopMode === "system" && state.desktop && this.monitored)
      await this.listen(false);
    for (const key of ["screen", "screenB", "camera"]) {
      const track = this.streams[key]?.getVideoTracks()[0];
      if (track)
        try {
          await track.applyConstraints({
            width: { ideal: options.width },
            height: { ideal: options.height },
            frameRate: { ideal: options.fps, max: options.fps },
          });
        } catch {
          this.emit(
            "error",
            `${key} kept its available capture format. Check a short recording before a full take.`,
          );
        }
    }
    this.compositor.outputWidth = options.width;
    this.compositor.outputHeight = options.height;
    this.compositor.fps = options.fps;
    try {
      this.compositor.setRecording(true);
      this.compositor.draw(); // The compositor owns pacing. A second capture timer can miss completed frames.
      this.canvasStream = this.canvas.captureStream(0);
      this.compositor.captureTrack = this.canvasStream.getVideoTracks()[0];
      const combined = new MediaStream([
        ...this.canvasStream.getVideoTracks(),
        ...this.mixDestination.stream.getAudioTracks(),
      ]);
      const candidates =
        options.codec === "vp8"
          ? ["video/webm;codecs=vp8,opus", "video/webm"]
          : [
              "video/webm;codecs=h264,opus",
              "video/webm;codecs=vp8,opus",
              "video/webm",
            ];
      const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) throw Error("This runtime has no compatible video recorder.");
      this.recorder = new MediaRecorder(combined, {
        mimeType: mime,
        videoBitsPerSecond: options.bitrate || 9000000,
        audioBitsPerSecond: 256000,
      });
      this.session = await window.take.begin({
        name: options.name,
        sampleRate: this.ctx.sampleRate,
        voice1: state.mic1,
        voice2: state.mic2,
        desktop: state.desktop,
        width: options.width,
        height: options.height,
        fps: options.fps,
        settings: {
          voices: this.voiceSettings,
          desktop: this.desktopSettings,
          master: this.masterSettings,
        },
        initialScene: this.compositor.scene,
        layout: structuredClone(this.compositor.layout),
        compositions: structuredClone(this.compositor.documents),
        quality: options.quality,
        captureMime: this.recorder.mimeType,
        bitrate: options.bitrate,
        sourceFormats: Object.fromEntries(
          ["screen", "screenB", "camera"]
            .filter((k) => this.streams[k])
            .map((k) => {
              const v = this.streams[k].getVideoTracks()[0].getSettings();
              return [
                k,
                { width: v.width, height: v.height, frameRate: v.frameRate },
              ];
            }),
        ),
      });
      this.activeTracks = new Set([
        "mix",
        "video",
        ...(state.mic1 ? ["voice1", "raw1"] : []),
        ...(state.mic2 ? ["voice2", "raw2"] : []),
        ...(state.desktop ? ["desktop"] : []),
      ]);
      this.queue = Promise.resolve();
      this.blobQueue = Promise.resolve();
      this.ioFailed = false;
      this.pendingBlobBytes = 0;
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) {
          this.pendingBlobBytes += e.data.size;
          if (
            this.pendingBlobBytes + this.pendingBytes > 64 * 1024 * 1024 &&
            !this.ioFailed
          ) {
            this.ioFailed = true;
            this.emit(
              "error",
              "Video storage cannot keep up. Stopping to preserve this take.",
            );
            queueMicrotask(() => this.stop().catch(() => {}));
          }
          this.blobQueue = this.blobQueue
            .then(async () => {
              const data = await e.data.arrayBuffer();
              for (let i = 0; i < data.byteLength; i += 2 * 1024 * 1024)
                this.enqueue("video", data.slice(i, i + 2 * 1024 * 1024));
            })
            .catch((error) => {
              this.ioFailed = true;
              this.emit("error", error.message);
              queueMicrotask(() => this.stop().catch(() => {}));
            })
            .finally(() => {
              this.pendingBlobBytes -= e.data.size;
            });
        }
      };
      this.recorder.onerror = (e) => {
        this.emit("error", e.error?.message || "The video encoder stopped.");
        this.stop().catch(() => {});
      };
      this.startedAt = this.ctx.currentTime;
      this.startedWall = performance.now();
      this.elapsed = 0;
      this.paused = false;
      this.pausedTime = 0;
      this.recorder.start(1000);
      this.node.port.postMessage({
        type: "start",
        frame: Math.round(this.startedAt * this.ctx.sampleRate),
        enabled: ["voice1", "voice2", "desktop", "mix", "raw1", "raw2"].map(
          (k) => this.activeTracks.has(k),
        ),
      });
      this.recording = true;
      this.emit("recording", true);
    } catch (e) {
      this.compositor.captureTrack = null;
      this.canvasStream?.getTracks().forEach((t) => t.stop());
      this.compositor.setRecording(false);
      if (this.session) await window.take.end({ error: e.message });
      this.session = null;
      throw e;
    }
  }

  time() {
    return this.recording
      ? Math.max(
          0,
          (this.paused ? this.pauseAt : this.ctx.currentTime) -
            this.startedAt -
            this.pausedTime,
        )
      : this.elapsed;
  }
  pause() {
    if (!this.recording || this.finishing || this.starting) return;
    if (!this.paused) {
      this.recorder.pause();
      this.pauseAt = this.ctx.currentTime;
      this.node.port.postMessage({
        type: "pause",
        frame: Math.round(this.pauseAt * this.ctx.sampleRate),
      });
      this.paused = true;
    } else {
      const now = this.ctx.currentTime;
      this.recorder.resume();
      this.node.port.postMessage({
        type: "resume",
        frame: Math.round(now * this.ctx.sampleRate),
      });
      this.pausedTime += now - this.pauseAt;
      this.paused = false;
    }
    this.emit("paused", this.paused);
  }
  stop() {
    if (this.stopping) return this.stopping;
    if (!this.recording) return Promise.resolve();
    this.stopping = this.finishRecording().finally(() => {
      this.stopping = null;
    });
    return this.stopping;
  }
  async finishRecording() {
    this.finishing = true;
    const outputsStopped = this.outputs
      .stopAll()
      .catch((e) => this.emit("error", e.message));
    this.elapsed = this.time();
    this.recording = false;
    this.emit("saving", true);
    const timers = [];
    let failure, result;
    const bounded = (operation, ms, label) => {
      let timer;
      return Promise.race([
        operation,
        new Promise((resolve) => {
          timer = setTimeout(() => {
            failure = `${label} did not finish in time. Review or recover this take before using it.`;
            resolve();
          }, ms);
          timers.push(timer);
        }),
      ]).finally(() => clearTimeout(timer));
    };
    try {
      const audioStopped = new Promise((resolve) => {
        this.stopResolve = resolve;
      });
      this.node.port.postMessage({
        type: "stop",
        frame: Math.round(this.ctx.currentTime * this.ctx.sampleRate),
      });
      const videoStopped = new Promise((resolve) => {
        if (this.recorder.state === "inactive") return resolve();
        this.recorder.onstop = resolve;
        this.recorder.stop();
      });
      await Promise.all([
        bounded(audioStopped, 2500, "Audio capture"),
        bounded(videoStopped, 5000, "Video capture"),
      ]);
      for (const timer of timers) clearTimeout(timer);
      this.stopResolve = null;
      await this.blobQueue;
      await this.queue;
      await outputsStopped;
    } catch (error) {
      failure = error.message;
    } finally {
      for (const timer of timers) clearTimeout(timer);
      this.stopResolve = null;
      try {
        result = await window.take.end({
          error:
            failure ||
            (this.ioFailed
              ? "Storage could not keep up; inspect the take before using it."
              : undefined),
        });
      } finally {
        this.compositor.captureTrack = null;
        this.canvasStream?.getTracks().forEach((t) => t.stop());
        this.session = null;
        this.compositor.setRecording(false);
        this.finishing = false;
        this.paused = false;
        this.updateIdle();
        this.emit("recording", false);
      }
    }
    if (failure) this.emit("error", failure);
    if (result) this.emit("saved", result);
    return result;
  }
  async marker(label = "Marker") {
    if (!this.recording) return;
    await window.take.event(this.session.id, {
      type: "marker",
      time: this.time(),
      label,
    });
    this.emit("marker", { time: this.time(), label });
  }
  async sceneEvent(scene) {
    if (this.recording)
      await window.take.event(this.session.id, {
        type: "scene",
        time: this.time(),
        scene,
      });
  }
}
