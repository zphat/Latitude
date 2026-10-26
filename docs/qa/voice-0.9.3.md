# Latitude 0.9.3 voice refinement QA

Measured 2026-10-26 on the same Linux executor, Node 24.22.1, Chromium/Electron
integration with GPU disabled. These are synthetic/automated checks, not a real
microphone listening panel or a certification of every device/platform.

## Scope and findings

The voice path already selects mono and places it equally in both mix channels;
no stereo widener was found. Earlier perceived airiness cannot be diagnosed
conclusively without the user's recording. The changes are restrained defaults
and selective de-essing, not a new mastering stack. Existing numeric profiles
are preserved; the revised de-esser applies to enabled chains globally. Reapply
adopts new defaults without resetting gain, channel, mute or sync delay.

The prior lowpass-subtraction de-esser also attenuated lower speech detail. The
new constant-0-dB-peak bandpass applies a focused dynamic cut, using band/total
energy and smoothed gain. At 3.5 dB maximum reduction, steady-tone checks gave:

| Frequency | 44.1 kHz change | 48 kHz change |
| --- | ---: | ---: |
| 1.5 kHz | 0.00 dB | 0.00 dB |
| 3 kHz | −0.12 dB | −0.13 dB |
| 4 kHz | −0.84 dB | −0.85 dB |
| 6.5 kHz | −3.50 dB | −3.50 dB |

The mixed-tone regression also preserves the lower speech component while
reducing sibilance. These are signal tests, not subjective proof of voice quality.
The filter coefficients follow the constant-peak bandpass in the
[W3C Audio EQ Cookbook](https://www.w3.org/TR/audio-eq-cookbook/).

No new dependencies, lookahead delay or audio buffers were added to the voice
path. Expensive de-esser gain conversion runs at approximately 1.5 kHz control
rate with sample-smoothed gain. Disabled processing sleeps after release.

## Automated results

- **106/106 shared tests passed**: DSP, worklet, scene model, recording storage,
  real FFmpeg exports/formats, streaming, editor and updater.
- AudioWorklet-to-UI test passed: current-window clipping outline, limiter
  readings, focused de-esser activity/release, compact layout, old-profile
  preservation, Reapply settings and Custom → Use Natural behavior.
- Native editor integration passed: IPC, seeking, audio preview, linked cuts,
  insertion, detach/paste, title drag, save/reopen, real export and module unload.
- Local RTMP integration passed: 29.98 decoded fps at 720p30, 3 ms end A/V skew,
  maximum keyframe gap 1.925 s; reconnect left local recording intact and a
  cancelled connection did not restart. Actual encoded FPS is visible in the UI.
- XML, JavaScript syntax and whitespace checks passed. Platform package tests
  are additionally enforced by the release workflow; consult its exact result.

## Accelerated long audio clock

`npm run soak:audio` processed 90 minutes of audio clock in 147.38 seconds. It
exercised two voice inputs, desktop ducking, six stems, live PCM, two-second
pause/resume, voice disconnection/reconnection and bypass changes.

- Every recorded track contained **259,104,000 frames** (90 minutes minus pause).
- **259,198,976 complete live frames** were contiguous across recording pause.
- **63,258 PCM chunks** were consumed immediately instead of retained in memory.
- Sampled processed peaks stayed at/below the −1.5 dBFS ceiling. Raw stems
  exceeded full scale as deliberately injected; they were not falsely limited.
- Maximum sampled ArrayBuffer growth: **1.91 MiB**; RSS growth: **44.54 MiB**.

This is not a 90-minute real-time device/video/disk recording. Memory sampling is
not a heap-leak proof. The final incomplete live packet is outside the packet
count assertion. Exhaustive sample-ceiling checks run separately in unit tests.

## Same-host worklet timing

Five warmed trials per workload, median processing time for 20 seconds of audio.
The old and revised versions were run sequentially with no other benchmark.
These figures exclude capture, video, IPC, disk and UI and are not whole-app CPU.

| Workload | 0.9.2 | 0.9.3 |
| --- | ---: | ---: |
| Idle before suspension | 121 ms | 127 ms |
| One Natural voice | 732 ms | 668 ms |
| Two Podcast voices + desktop | 728 ms | 620 ms |

Active voice workloads took less processing time in this run; idle timing varies.
This does not establish performance leadership over OBS or every hardware setup.

## Video regression and limits

Actual H.264 recording/export at 1080p Balanced, approximately six seconds each:

| Requested | Decoded frames | Audio duration | Decoded fps | Drawing fps |
| --- | ---: | ---: | ---: | ---: |
| 30 fps | 185 | 6.173 s | 29.97 | 30.01 |
| 60 fps | 326 | 6.093 s | 53.50 | 59.03 |

Small-text checks and UI-error checks passed. **The CPU-only host did not sustain
full 60 fps output.** Drawing FPS cannot be presented as encoded FPS. This update
does not change the gameplay capture architecture or establish hardware encoding
performance. Use [PERFORMANCE.md](../PERFORMANCE.md) for real-machine testing.

Still needed: matched-loudness real-mic listening, Windows/Fedora/Bazzite hardware
capture and long-session tests, public platform streaming and an identical-scene
OBS comparison. SteamOS Gaming Mode remains unsupported. The user's successful
roughly 70-minute podcast on an earlier build is anecdotal feedback, not the
controlled test above. Hardware input overload cannot be repaired by limiting;
lossy encoding can create intersample overs. Use measured export loudness/true
peak results for a finished podcast.
