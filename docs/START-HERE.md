# Your first Latitude recording

Start with one microphone and one screen. A camera, second microphone, streaming
and editing are optional. You do not need an account to record.

Use the installer from [Releases](https://github.com/zphat/Latitude/releases),
not GitHub's **Code → Download ZIP**, which contains source for developers.
Windows is a beta; Linux is a preview. [Mac builds](MACOS.md) are development
previews, not a verified public beta. Choose the guide for your platform:
[Windows installation](../README.md#open-the-windows-app) · [Linux](LINUX.md).

## Make a short test before your first episode

1. **Choose your microphone.** Onboarding lets you select Voice 1 and enable it.
   You can skip it for a screen-only recording. Change devices later in
   **Inputs & outputs**. Leave Voice 2 disconnected unless you need it.
2. **Choose a voice preset, then run Soundcheck.** Start with Natural voice or
   Podcast broadcast in Voice Studio. Soundcheck takes 12 seconds: follow its
   quiet/speaking prompts and review the suggested adjustment. Lower the mic or
   interface's hardware gain if Input clips. Processing cannot repair overload
   already captured at the device. On an existing setup, **Reapply** adopts the
   current preset while keeping gain, channel, mute and sync delay; run Soundcheck
   again afterwards because the preset also resets the noise threshold.
3. **Connect a screen or window.** Use Screen only if you do not want a facecam.
   Add a camera only when needed. Drag sources in the preview; use Scene layers
   for exact crop, position, visibility and lock. Check that browser tabs,
   notifications and taskbar areas you want private are outside the final frame.
   For two areas of one monitor, use Two views and reuse screen A with separate
   crops. A separate screen B is optional.
4. **Check the audio you want.** Play a short desktop sound and speak. Watch the
   separate voice and desktop meters. Use headphones if monitoring. Avoid hearing
   both hardware direct monitoring and Latitude's delayed monitor at once.
   If desktop sound masks speech, reduce its gain or try optional speech ducking.
5. **Record 30–60 seconds.** Clap once, speak softly and normally, say a few sharp
   S sounds, and briefly get louder. Pause/resume once if you plan to use it.
   Stop, then play the saved result. Check picture detail, audible words, both
   audio sources and sync. Start with 1080p30; test 60 fps on your own hardware.
6. **Choose how to edit.** MP4 is a useful first delivery format. Keep separate
   source tracks enabled. If your editor exposes only the full mix, import the
   aligned WAV stems at the same timeline start and mute the video's mix. Do not
   play the full mix and its component stems together. See [formats](FORMATS.md).

Processed voice tracks and the full mix have peak protection. Raw backups keep
the original input; they are intentionally not limited. Input clipping, processed
sample peaks and the final encoded file's true peaks are different measurements.

## Add tools when you need them

- **Mods → Latitude Editor** adds local editing. Import an intro or images,
  cut linked clips and save a `.latitude-edit` project. Projects reference their
  original media, so keep both. See [your first edit](EDITOR.md).
- **Mods → Latitude Streaming** adds live output. It requires your destination's
  server/key and an explicit start. Test privately first. See [streaming](STREAMING.md).
- **Settings → Import pack** adds a theme/layout pack. Export your current layout
  first if you want to keep it; a new community pack replaces the installed pack.
  Packs do not connect devices or change microphone processing.

## If something sounds or looks wrong

| Symptom | First check |
| --- | --- |
| No voice | Hardware mute, selected input and left/right channel in Inputs & outputs |
| Voice sounds doubled or hollow | Duplicate mic sources or direct + software monitoring at the same time |
| Red Input outline | Lower hardware gain; the separate held warning is a history reminder |
| Desktop audio is missing | Platform permissions/routing; [Linux guide](LINUX.md) or [Mac limits](MACOS.md) |
| Speech is hard to hear over gameplay | Desktop gain, duplicate playback and optional ducking before adding stronger EQ |
| Audio plays twice after importing into another editor | Mute the video/full mix when using its separate source stems |
| Editor media is missing after moving files | Use Relink source; a project is not a self-contained media archive |
| Recording is less smooth than preview | Check the saved file and try a lower frame rate; drawing FPS is not encoded FPS |

Keep the original take while troubleshooting. In Settings, **Technical details**
provides a report to review before sharing. Report the version, platform, exact
steps and what you expected through [GitHub issues](https://github.com/zphat/Latitude/issues)
or [Discord](https://discord.gg/EnPRdDutAn). Private recordings and stream keys
are not needed. [Beta testing guide](../BETA-TESTING.md).
