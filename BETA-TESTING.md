# Trying Latitude 0.5 beta

Install the Windows x64 **Setup.exe**, then open Latitude from the desktop or Start menu. To update, close the old copy first and run the newer installer. Keep existing takes; uninstalling does not remove recordings or preferences.

## First ten minutes

1. Choose Voice 1 in onboarding; leave Voice 2 off unless needed. Open Soundcheck, stay quiet for three seconds, then speak naturally. Lower hardware gain if INPUT CLIP appears. Reset peaks clears the held warning after adjustment.
2. Start with Natural voice or Podcast broadcast. Try Rich clarity at 25–35%, and compare its on/off control at the same listening level. Monitor through headphones; hardware direct monitoring is preferable while capturing system audio.
3. Select a screen/window, play desktop audio, and check its meter. Facecam is optional. Drag sources, crop browser tabs/taskbar, add text if wanted, and try a scene hotkey.
4. Record a one-minute take at 1080p/30. Clap for sync, speak, play a clip, pause/resume, mute/unmute, switch scenes, and add a marker. Stop and let export finish.
5. Play the export. Check picture smoothness, lip sync, final words, audio quality, and the isolated WAVs. All stems should have the same duration. In CapCut, align the WAVs and video at the same start, mute the video's full mix, and group/link before editing. Optional per-track video copies give each clip instance a different soundtrack.
6. Try canceling a second export. Your originals and earlier export must remain. Close/reopen Latitude and verify settings. Confirm the desktop shortcut works without opening an application folder.

## Try the new format choices

- Settings → Recording & export format starts with MP4 and separate sources on. Read each format note; MP4, MKV and MOV are suggested video choices.
- Export the same short take once with separate sources on and once off. In a player/editor that supports audio selection, the first should have Full mix, Voice 1, Voice 2 (if recorded) and Desktop (if recorded). The second should have just Full mix.
- For CapCut, use MP4 plus WAV editing files. If your version does not expose embedded tracks, align the WAVs with the video or enable a video copy for each isolated source.
- Try WAV or FLAC for audio-only editing: the mix and each source are separate files. Try MP3/M4A for listening. Check the final words and sync with your editor; lossy decoder delay handling can vary.
- Disable WAV editing files and video copies, then compare the export folder size. Original recordings are retained separately. Changing just the container does not automatically reduce captured video size.
- Use Play after each export. Try a one-off format, then remember a different choice and restart the app. Your preference should persist. Cancel an export and verify earlier exports and originals remain.

## Before sharing a long episode

Try a 60–90 minute take with your normal sources and background applications. Watch frame rate, disk space, CPU/RAM in Task Manager, and playback near the beginning and end. Exercise a device disconnect, an external shortcut, and save-and-close. Higher formats are optional: 4K/60 is not guaranteed on every machine. Start with a short test before important work.

## Share feedback

Settings → **Technical details** shows a report you can review and copy. **Report a bug / idea** opens GitHub issues. Include what you expected, what happened, steps, version, Windows version, devices, recording settings, and a short public sample only if useful. Do not attach private recordings. The app does not upload diagnostics automatically.

See [BUILD-REPORT.md](BUILD-REPORT.md) for automated evidence and [ROADMAP.md](ROADMAP.md) for Linux and performance work. This unsigned beta still needs real-device feedback; it is not yet a production-reliability guarantee.
