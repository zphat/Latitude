# Streaming 0.8.0 verification

## Scope and implementation review

The optional first-party module is approximately 32 KB of uncompressed source (UI, lifecycle, muxer and native transport). It adds no production package, encoder binary, framework, DSP stage or second capture graph. Disabled modules are not imported, and enabling creates UI only. Starting streaming creates the encoder, bounded mix tap, single publisher and one-client relay. This is an architectural overhead review, not a whole-app CPU/memory comparison with OBS.

Streaming uses the existing processed stereo mix and compositor clock. WebCodecs H.264 is copied by bundled FFmpeg; only PCM-to-AAC audio encoding happens in FFmpeg. Recording alongside streaming adds a second video encode to keep recording quality independent. AAC is lossy; live processing does not run export loudness normalization or repair already-clipped input.

## Automated evidence

- Shared suite: 67 tests passed before the final missing-encoder test was added; that test plus all seven other native streaming tests also passed with the exact bundled Linux FFmpeg 7.0.2. The full release gate now contains 68 tests.
- Actual RTMP and verified RTMPS receivers decode both video and audio. Untrusted certificates and hostname mismatches are rejected. Invalid destinations/keys, concurrent starts, oversized packets, stalled upload, nonexistent encoder, orderly stop and restart are covered. State messages do not contain keys or native paths.
- The AudioWorklet live tap exactly matches the finished stereo output sample-for-sample, including while local recording is paused. Timestamps remain continuous; wrong/stale stop IDs are ignored; disabled output allocates no streaming buffer and sends no streaming PCM.
- Chromium integration uses the actual scene canvas, AudioWorklet, WebCodecs, muxer, native publisher and local RTMP receiver. It tests streaming without recording, starting/pausing/resuming/stopping a local take, ending streaming while retaining recording, receiver disconnect/reconnect, cancellation during setup, no delayed restart, no persisted key, and disabling/unloading the UI/listener. Both local takes finalize normally.
- Final 720p30 run: **30.01 received fps**, **38 ms A/V end timestamp difference**, **1.933 s maximum keyframe interval**, **zero encoder-queue skips**. Decoded test audio remained finite, audible and below full scale (peak 0.1623). This tone is routing evidence, not a speech/music listening test.
- Software-only 1080p60 target with simultaneous recording: **51.23 received fps**, **0 ms A/V end difference**, **1.915 s maximum keyframe interval**, zero encoder-queue skips. Timing/capture stalls can reduce actual fps without filling the encoder queue. The UI now shows average encoded-output fps alongside the queue-skip counter. **This machine did not sustain 60 fps in that run.** Hardware acceleration and other hardware remain unverified.
- Electron 44.8.0 itself, using the installed-app smoke path with a headless software renderer, encoded three H.264 frames and produced usable Matroska header/packet bytes. This checks the actual app runtime, not just browser API availability.
- Existing refinement regression passed with zero renderer errors: idle preview produced zero paints, hidden paused preview stopped its timer and preserved 1920-pixel output width, recording/pause controls worked, theme/layout packs survived disable/reload/remove, and compact layouts avoided horizontal overflow. Preview recording and stream-stop controls remain visible at 960 × 640.

## Release gates and remaining limits

Publishing requires the shared tests, browser streaming integration, exact bundled Windows encoder tests, Windows install/launch/uninstall checks, real Linux PulseAudio/PipeWire checks, Linux package installation, and actual installed Electron H.264 encoding. Publication state is verified through GitHub Actions rather than assumed from these local results.

No authenticated public-platform broadcast, real-speech listening evaluation, long-duration soak, multi-GPU benchmark or every-distro/device certification has been performed. Live hardware encoding support is chosen at runtime. Platform dashboards must confirm reception, privacy and Go Live behavior. RTMP is plaintext; RTMPS validates certificates and hostnames. Stream keys are memory-only but can be visible to another process with the same OS-user access.

A stalled stream never writes a local take automatically. Local takes survive stream transport failure when explicitly recorded. Exports are blocked during streaming, and automatic export is skipped for takes saved while live; the UI directs users to export from Takes afterwards. Linux Flatpak explicitly adds network permission for the opt-in output. Third-party executable installation and the editor remain out of scope.
