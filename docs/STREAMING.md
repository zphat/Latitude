# Latitude Streaming beta

Enable **Latitude Streaming** in **Mods**, then open **Stream** in the sidebar. It is included in 0.8, off by default, with no extra download or subscription. Disabled streaming loads no implementation, encoder, socket or extra capture. The editor mod is still planned.

## First broadcast

1. Connect and arrange sources in **Studio**. Choose a voice preset, run Soundcheck and check your input meters. Headphones avoid desktop feedback.
2. For a light starting point, choose **Settings → 720p / 30 fps**. Streaming shares the Studio canvas with local recording. This beta supports up to **1080p60**; choose 30 fps if the scene, GPU or connection struggles.
3. In **Stream**, choose Twitch, YouTube or Custom. Paste the **server URL** and **stream key** separately from the platform dashboard. Prefer the platform's **RTMPS** address. Plain RTMP is unencrypted.
4. Set bitrate within platform limits, leaving upload headroom. Try 3,500–4,500 kb/s for 720p30. Presets are starting points, not an upload-speed test or platform certification. AAC is 48 kHz stereo at 128/160/192/256 kb/s. Twitch's preset uses 160; YouTube's uses 128.
5. Click **Start streaming**. **Sending** means the encoder is producing media for the connection. Check picture, sound, sync, privacy and stream health in the platform dashboard; some services require another **Go Live** action. Mute the platform preview to avoid feedback.
6. **End stream** is on the Stream page, beside the preview, and in fullscreen. The top status button opens Stream from any page.

**Test privately first.** Twitch's bandwidth-test option is restricted to a Twitch ingest host and `/app` path. It adds Twitch's official `bandwidthtest=true` flag. For YouTube, use a private/unlisted test event. Custom server behavior depends on its settings. Latitude does not change a platform event's privacy or title.

## Audio and local takes

The broadcast contains **one stereo full mix**: processed microphones, desktop audio, gain/mutes, optional desktop ducking and Rich clarity, and the master limiter. The existing float mix is encoded to AAC once. The live limiter cannot repair clipped hardware input; leave input headroom. Export loudness normalization is offline and does not run on the live stream.

Start a local take in Studio for isolated microphone/desktop tracks, the full mix and raw voice backups. Record and Stream have **independent Stop controls**. **Pausing recording does not pause the broadcast.** A local take continues after streaming ends, and streaming can continue without disk recording. Streaming alone uses one video encode. Recording alongside it adds a second encode but shares composition and audio processing. Export from Takes after broadcasting ends. Automatic export is skipped for takes saved while streaming.

## Reliability and privacy

- Three reconnect attempts wait 2, 4 and 8 seconds. Each starts fresh codec headers and a keyframe. The platform broadcast may be interrupted; a local recording keeps running.
- Queues, startup and writes are bounded. Lower bitrate or resolution if the output cannot keep up. The video rate is the average encoded-output rate for the current connection; encoder skips count frames dropped from an overloaded encoder queue. Timer/capture stalls can also lower the video rate. These statistics describe Latitude, not end-viewer playback.
- Server and key fields are session-only; they do not enter preferences, packs, diagnostics or application logs. Starting hides a revealed key. Clear the field on shared computers. Processes running as the same OS user may inspect child-process arguments or memory.
- RTMPS checks certificates and hostnames. Invalid/self-signed endpoints fail; there is no ignore-certificate option. Use a verified certificate, or explicitly choose plain RTMP on a trusted local network for a local ingest service.
- Linux Flatpak 0.8 adds network permission. Merely enabling/restoring the module opens no streaming connection.

## Beta scope and feedback

One RTMP/RTMPS destination at a time, H.264/AAC, up to 1080p60. No account linking, chat, alerts, platform event management, multistream, SRT, WHIP/WebRTC, HDR or 4K streaming in this first module. Local recording retains its higher-resolution options. No arbitrary executable-mod downloader is included.

Automated tests cover local RTMP/RTMPS receipt, actual video/audio decode, TLS rejection, blocked uploads, reconnects, and independent recording. **Authenticated Twitch/YouTube/custom-platform broadcasts and real-speech listening remain unverified.** Hardware encoders, long sessions and upload variability need feedback. Check a private test before an important show.

Report OS, GPU, platform, resolution/fps, video/audio bitrate, simultaneous recording, skipped-frame count, and whether the platform received clean picture/audio. Never post a key. Feedback: https://discord.gg/EnPRdDutAn or https://github.com/zphat/Latitude/issues.

References: [Twitch broadcasting](https://dev.twitch.tv/docs/video-broadcast/), [YouTube encoder settings](https://support.google.com/youtube/answer/2853702), [WebCodecs AVC](https://www.w3.org/TR/webcodecs-avc-codec-registration/), [Matroska mappings](https://www.matroska.org/technical/codec_specs.html).
