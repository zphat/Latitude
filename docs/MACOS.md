# macOS development preview

Targets macOS 14.2 or newer, with separate Apple Silicon and Intel packages.
The GitHub macOS workflow builds DMG and ZIP artifacts. These are development
previews, not public downloads or hardware-certified releases.

Drag Latitude from the DMG into Applications. Screen capture, system audio,
microphone and camera require macOS privacy permissions. Launch the installed
app directly rather than through Terminal for permission testing. Restart after
changing privacy permissions. Use headphones to prevent playback feedback.

The shared voice processing, separate tracks and optional mods are retained.
System audio uses Electron's native CoreAudio loopback path. Test actual device
routing and denied/revoked permissions before a long recording. Reference:
https://www.electronjs.org/docs/latest/api/desktop-capturer

Release gates: inspect encoder licenses/source provenance, verify both packaged
architectures launch, test microphone/camera/screen/system audio and long-take
sync on a real Mac, configure Developer ID signing and Apple notarization, and
add a macOS update-install flow. The existing updater treats this build as
development; automatic Mac installation is not implemented yet.
Do not disable Gatekeeper or system security to test this preview.
