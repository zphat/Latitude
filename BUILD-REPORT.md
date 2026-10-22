# Latitude 0.8.0 build review

The first official Streaming mod is implemented and disabled by default. It shares Latitude's scene compositor and processed stereo mix, provides independent streaming/recording ownership, copies H.264 through the bundled encoder, and encodes audio to AAC once. No production dependency, framework, capture graph or DSP stage was added.

See [the detailed streaming QA report](docs/qa/streaming-0.8.0.md) for executed tests, actual received frame rates, audio/video timing, limitations and release gates. See [Streaming setup](docs/STREAMING.md) for user guidance and [Modding](MODDING.md) for extension contracts.

Local RTMP/RTMPS, TLS rejection, stalled upload, reconnect, cancellation, independent local recording and existing recording regressions pass. A 720p30 test delivered 30.26 fps; a software-only 1080p60 target with simultaneous recording delivered 51.23 fps, so 60 fps is not guaranteed. No authenticated Twitch/YouTube broadcast or real-speech listening test is claimed.

The prior format/export review remains available in the v0.5.0 Git history; 0.7 picture/UI changes remain documented in its release notes. This release preserves separate local tracks and all eight export formats.

The audio follow-up adds separate input/output meters, per-window clipping outlines, numeric headroom and limiter activity. All 72 unit/integration tests pass locally, plus real-browser meter timing and recording regressions. Existing continuous limiters were verified on saved mic stems under extreme gain and bypass; software cannot repair clipped hardware input or guarantee the peaks of every lossy codec. No DSP stage was duplicated. See the QA report for timing, performance and default-processing details.
