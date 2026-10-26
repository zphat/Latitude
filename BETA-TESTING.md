# Trying Latitude — Windows beta and Linux preview

Install the Windows x64 **Setup.exe**, then open Latitude from the desktop or Start menu. From 0.9.1, launch checks offer Update now or Skip until next launch. Older builds need one manual update. Keep existing takes; uninstalling does not remove recordings or preferences.

On Linux x86-64, open the **.flatpak** in Discover or another Flatpak-capable software center and install, then launch Latitude from the application menu. See the [Linux guide](docs/LINUX.md) for prerequisites, terminal installation, permissions, and preview limits. SteamOS testing is for **Desktop Mode**; Gaming Mode is not supported.

## First ten minutes

1. Choose Voice 1 in onboarding; leave Voice 2 off unless needed. Pick Natural voice or Podcast broadcast, then open Soundcheck, stay quiet for three seconds, then speak naturally. Lower hardware gain if INPUT CLIP appears. Reset peaks clears the held warning after adjustment.
2. Try Rich clarity at 15–25%, and compare its on/off control at the same listening level. Monitor through headphones; hardware direct monitoring is preferable while capturing system audio.
3. Select a screen/window, play desktop audio, and check its meter. Facecam is optional. Drag sources, crop browser tabs/taskbar, add text if wanted, and try a scene hotkey.
4. Record a one-minute take at 1080p/30. Clap for sync, speak, play a clip, pause/resume, mute/unmute, switch scenes, and add a marker. Stop and let export finish.
5. Play the export. Check picture smoothness, lip sync, final words, audio quality, and the isolated WAVs. All stems should have the same duration. In CapCut, align the WAVs and video at the same start, mute the video's full mix, and group/link before editing. Optional per-track video copies give each clip instance a different soundtrack.
6. Try canceling a second export. Your originals and earlier export must remain. Close/reopen Latitude and verify settings. Confirm the desktop shortcut or application-menu entry works without opening an application folder.

## Linux checks

- On Wayland, choose a screen/window in your desktop's permission dialog. Cancel once and verify Latitude stays usable. Try Screen B separately and check that desktop audio is not doubled.
- In Inputs & outputs, choose your playback output. Verify the Desktop meter responds while your microphone is muted. Disconnect screen sharing and confirm desktop audio still works.
- Between takes, change headphones/speakers and reconnect desktop audio. Test an unplug during a short recording: the app should report the lost source and keep the other sources recording. Reconnect between takes.
- Close Latitude and confirm its temporary `latitude_desktop_…` input disappears from system audio settings. Your default microphone/output and volume should stay unchanged.
- Test your webcam, global scene shortcuts, and playback in your editor. Start with Videos/Latitude; if you choose another folder, verify it remains writable after restarting.

## Try the new format choices

- Settings → Recording & export format starts with MP4 and separate sources on. Read each format note; MP4, MKV and MOV are suggested video choices.
- Export the same short take once with separate sources on and once off. In a player/editor that supports audio selection, the first should have Full mix, Voice 1, Voice 2 (if recorded) and Desktop (if recorded). The second should have just Full mix.
- For CapCut, use MP4 plus WAV editing files. If your version does not expose embedded tracks, align the WAVs with the video or enable a video copy for each isolated source.
- Try WAV or FLAC for audio-only editing: the mix and each source are separate files. Try MP3/M4A for listening. Check the final words and sync with your editor; lossy decoder delay handling can vary.
- Disable WAV editing files and video copies, then compare the export folder size. Original recordings are retained separately. Changing just the container does not automatically reduce captured video size.
- Use Play after each export. Try a one-off format, then remember a different choice and restart the app. Your preference should persist. Cancel an export and verify earlier exports and originals remain.

## Before sharing a long episode

Try a 60–90 minute take with your normal sources and background applications. Watch frame rate, disk space, CPU/RAM in Task Manager or your Linux system monitor, and playback near the beginning and end. Exercise a device disconnect, an external shortcut, and save-and-close. Higher formats are optional: 4K/60 is not guaranteed on every machine. Start with a short test before important work.

## Share feedback

Join [Latitude's Discord](https://discord.gg/EnPRdDutAn) for feedback, questions, and updates. Settings → **Technical details** shows a report you can review and copy. **Report a bug / idea** opens GitHub issues for structured reports. Include what you expected, what happened, steps, app version, operating system, devices, and recording settings. On Linux, also include your distro/version, desktop, and Wayland or X11. Do not attach private recordings. The app does not upload diagnostics automatically.

See [BUILD-REPORT.md](BUILD-REPORT.md) for earlier automated evidence, [the Linux guide](docs/LINUX.md) for current Linux checks, and [ROADMAP.md](ROADMAP.md) for hardware testing and performance work. These preview builds still need real-device feedback.

## Voice refinement and mod checks

Existing tone settings are preserved. In Voice Studio, choose Podcast broadcast and click Reapply to adopt 0.9.3 defaults, then rerun Soundcheck. Reapply keeps input gain, channel, mute and delay. Compare raw and processed speech at matched loudness. Listen for clear consonants and natural word endings. The voice should remain centered when desktop audio is absent. The de-esser reduction readout should react to strong S sounds and release on other speech.

Enable Streaming and Editor separately in Mods. Check streaming reconnects without interrupting a local take. Test editor save/reopen, linked cuts, titles, fades and export. Use [PERFORMANCE.md](docs/PERFORMANCE.md) for repeatable capture/encoding measurements and a same-hardware OBS comparison; do not infer output FPS from preview FPS alone.
