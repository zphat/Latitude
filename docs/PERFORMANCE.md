# Performance and listening checks

Use the same machine, scene, source resolution, output resolution/frame rate, codec,
quality/bitrate, audio inputs and preview visibility when comparing Latitude builds
or OBS. Close unrelated GPU-heavy applications. Record driver, OS, power mode and
GPU encoder settings. Test 1080p/30 before 60 fps or 4K. Do not claim lower resource
use from a DSP microbenchmark alone.

## Capture and encoding

Record a moving game scene plus small readable text for 10 minutes, then a 60–90
minute session. Observe CPU, GPU encode/copy utilization, memory, disk writes and
A/V sync at both ends. Repeat with preview hidden and with streaming enabled.
Check actual decoded frame count and video duration with ffprobe. Preview drawing
FPS and the streaming mod's locally encoded FPS are different measurements;
neither guarantees the frame rate seen by a remote viewer.

Settings → Technical details takes a snapshot of drawing FPS, last draw time,
queued writes, capture dimensions/frame rate and recorder MIME. It includes no
source names or device IDs and adds no periodic sampling. Review it before sharing.

Test pause/resume, device disconnect/reconnect, stream reconnect, stopped devices,
slow disk and recovery of an interrupted take. Streaming failure must leave local
recording intact. Keep recordings outside the repository.

## Voice comparisons

Choose a preset first, then run Soundcheck. Reapplying a preset resets its noise
threshold, so calibrate again afterwards. Start Rich clarity at 15–25%, compare its
bypass at matched listening loudness, and stop when speech sounds natural. Use
headphones; avoid simultaneously hearing direct monitoring and delayed software
monitoring, which can produce a hollow/doubled sound.

Compare raw and processed stems at equal loudness using quiet speech, normal
phrases, plosives, S sounds, laughter and pauses. Check natural word tails and
consonants on headphones and speakers, both alone and alongside quieter music or
gameplay. EQ cannot overcome a mix that masks the voice; adjust desktop gain or
optional speech ducking when needed. Voice inputs are mono and centered. There is
no stereo widening or automatic gain control.

The default compressor reduces dynamic range; it does not ensure identical
loudness for every mic technique. Always-on sample limiting protects processed
mic tracks and the mix, including processing bypass. Raw backups remain raw.
Lower hardware gain if the Input meter clips: processing cannot undo overload
already captured by the microphone/interface. Lossy encoding can create
intersample peaks; use the export loudness pass and inspect its measured LUFS and
true-peak result for a finished podcast.

## Developer measurements

- `npm test`: DSP, worklet, scene, storage, export, editor, streaming and updater tests.
- `LATITUDE_BENCH_BASELINE=/path/to/old/checkout TAKE_FFMPEG=/path/to/ffmpeg node scripts/benchmark-export.cjs`:
  alternating old/current export timings on the same synthetic 30-second take,
  three runs each. Both preserve four embedded tracks and editing WAVs. Run
  without other tests or benchmarks. This measures export wall time, not live
  capture CPU, RAM or long-session performance. Omit the baseline to compare
  editing-file options within the current version.
- `npm run bench:audio`: five warmed trials per worklet workload; excludes video,
  devices, IPC, disk and UI. `LATITUDE_BENCH_ROOT=/path/to/old/checkout` compares
  another version on the same host. Run sequentially without other benchmarks.
- `npm run soak:audio`: 90 minutes of accelerated worklet clock, two voices,
  desktop, six stems, live PCM, pause/resume, disconnect and bypass changes.
  `LATITUDE_SOAK_MINUTES=10` shortens it. It is not 90 minutes of real device or
  recording time. Memory is sampled, not a full heap proof; partial live tail is
  outside its packet-count assertion.
- `tests/audio-meters-ui.cjs`, `tests/streaming-ui.cjs`, `tests/editor-mod-ui.cjs`, `tests/session-names-ui.cjs`:
  browser/native integration. Run sequentially; browser tests share a preview port.

A user reported a successful roughly 70-minute podcast on an earlier build. That
is useful feedback, not a controlled soak result: exact build, device and files
were not available for inspection. Keep new measured QA separate from that report.
