# Updating Latitude

Starting in **0.9.1**, packaged x64 Windows and Linux Flatpak builds check GitHub Releases once after launch. The check waits until setup dialogs and active recording, streaming or export work have finished. An offer has **Update now**, **Skip until next launch**, and release notes. Escape also skips. Skipping is remembered for this app process, including renderer reloads, and resets on a full relaunch. A manual check can reopen an offer at any time when the app is idle.

**0.9.0 and earlier need one manual installation of 0.9.1 to receive this feature.** No existing version can gain the updater without first being upgraded.

## What Update now does

| Build | Update behavior |
| --- | --- |
| Windows installed app | Downloads the matching NSIS installer, verifies SHA-256, saves preferences and the editor recovery draft, launches the installer and closes Latitude. Finish any installer prompt and reopen Latitude from its shortcut. |
| Windows portable ZIP | Downloads and opens the verified ZIP. Extract it, close Latitude, and replace the portable app folder. Keep your recording folder separately; do not delete it. This does not convert a portable copy into an installed app. |
| Linux Flatpak | Downloads and opens the verified Flatpak in the system software center. Confirm the update there, then restart Latitude. This is an assisted bundle update, not a background Flatpak repository update. |
| Mac development preview | Manual update: save the edit, quit Latitude, then replace Latitude in Applications using the matching Apple Silicon or Intel DMG. Keep recordings and projects. Launch checks and automatic installation are not supported yet. |
| Source checkout or unsupported package | Automatic checks are disabled. Use the source or release page directly. |

Settings → **App updates** offers a manual check, release notes, and **Check for updates at launch**. The setting persists separately from recording-folder settings. Disabled launch checks still allow a manual check. An offline or rate-limited launch leaves a quiet status in Settings; recording remains available. Failed downloads can be retried. Cancel removes unfinished download data when the app remains open. Any leftover updater cache is cleaned before the next download.

No update installs when quitting or without an explicit **Update now** choice. New recording, streaming, export and native editor media operations are blocked during an accepted download/install; cancel to resume. Native guards recheck before handoff. An active edit saves its newest recovery draft first; failure to save stops installation. Original recordings and projects are never updater targets.

## Network, resources and release trust

The check requests the public `zphat/Latitude` GitHub release list and the matching small `SHA256SUMS.txt` file over HTTPS. GitHub receives normal network request information, including IP address. Latitude sends no recording, device selection, project, stream key or account information. There is no account, telemetry upload, recurring network polling, delta-update agent or new production package dependency.

Beta builds (0.x or a prerelease version) include published beta releases; stable 1.x+ builds only offer stable releases. Drafts, older/equal versions, incomplete releases and packages for another platform are ignored. An offer requires the platform artifact and checksum to be published. Only exact Latitude release asset URLs and HTTPS GitHub download hosts are allowed, including redirect checks. Metadata size, file size, free space, timeouts and progress are bounded; downloads stream to disk rather than being buffered in memory. SHA-256 is checked during download and again immediately before opening the file.

The checksum is supplied by the same GitHub release: it verifies file integrity, not an independent publisher signature. Windows builds remain unsigned. Linux uses the existing software-center/portal path without additional sandbox privileges. If a system has no suitable file handler, use the release page and the manual install instructions; no shell commands are executed on the user's behalf.

## Development and validation

`electron/updater.cjs` owns release selection, bounded downloads, integrity verification and the update state. `electron/main.cjs` owns platform detection, busy guards, preference storage and handoff. `src/updates.js` displays states and saves the current editor draft through a promise-based lifecycle event. The renderer cannot supply a download URL, installer path or command. Only the fixed updater operations are exposed through the trusted preload bridge.

`node --test tests/updater.test.cjs` covers versions/channels, asset selection, disabled/once-per-launch checks, skip/reset, active-work guards, all package types, corruption/tampering, cancellation, timeout and hostile responses. `node tests/updater-ui.cjs` uses real Electron IPC with harmless network/installer fixtures and a temporary profile to verify startup deferral, reload/relaunch behavior, Settings, download/handoff, editor draft saving and persistence. Installer execution is deliberately replaced in that test. The Windows package CI separately exercises NSIS installation, replacement, relaunch and data retention. These tests do not certify every software center, Windows security prompt or user machine.
