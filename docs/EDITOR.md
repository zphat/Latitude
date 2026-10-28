# Latitude Editor · beta

Enable **Mods → Latitude Editor**, then choose **Edit** in the sidebar. The editor is optional, local and off by default. It does not start background rendering, model downloads or transcription. Recording and streaming remain in Studio; finish live capture before editing or exporting.

## Make your first edit

1. Choose **Use a Latitude take**, or **Import** videos, audio, intros, ads and images. A saved take's picture and processed source audio arrive on linked layers. Empty disabled recording inputs are omitted. Voice cleanup starts off because Latitude microphone stems already have live processing.
2. Select a media item. **Add at playhead** places it over the timeline; **Insert** makes room across all layers for an intro/ad; **Append** puts it at the end. Imported media stays where it is on disk.
3. Click a timeline clip. Drag it in time or to another compatible layer; drag its edges to trim. The inspector provides exact start, source-in and length values. Keep **Linked clips** checked to move, trim and split synchronized sources together. A video's **Separate audio into a linked layer** button lets you mix its sound independently.
4. Press **S** to split the linked selection, or Shift-click Split to cut all unlocked layers. Mark **I/O**, then **Remove range & close gap** to remove a pause across all layers. Small 4 ms audio ramps soften these joins; timing stays aligned. Locked affected layers must be unlocked first.
5. Add a video/audio layer for music, screenshots, an outro or another camera. Higher video layers cover lower layers. Select **+ Title** for text. Drag/resize pictures and titles directly in the preview. The inspector also offers crop, fit/fill, mirror, opacity, simple color looks, fades, slides and wipe reveal.
6. For a dissolve, put the next clip on the same video layer and choose **Dissolve from previous**. It overlaps the incoming clip by up to half a second and fades linked audio. It changes the incoming clip's start; check the later timeline when making an overlapping transition.
7. Click a layer name for its gain, pan and optional **Dialogue cleanup**. Per-clip gain, source-audio selection and fades are separate controls. Mute/solo affect audio; Hide affects picture. A waveform is generated only when you request **Build audio waveform**.
8. **Save project** stores a small `.latitude-edit` file. Keep original media with it. If files move, select the source and use **Relink source**. A local draft can recover the latest edit, but does not replace named project saves.
9. Choose **Export edit**. Export the entire timeline or a marked range, optionally retaining separate layers and WAV stems. The output goes into a new folder; originals are never overwritten.

## Audio and export

Preview monitoring has a sample-peak limiter at about −1.5 dBFS. Dialogue cleanup adds an 80 Hz rumble filter, a mild boxiness cut/presence lift and gentle compression. Keep it off for already-processed recordings. Preview is a lightweight audition; the export performs full-resolution rendering and optional two-pass loudness matching. Export dialogue compression runs continuously over the joined timeline, so cuts and internal rendering sections do not restart its envelope.

| Format | Suggested use | Separate audio | Size / compatibility |
| --- | --- | --- | --- |
| **MP4 · recommended** | Finished video, clips, sharing | Optional named AAC tracks plus 24-bit WAV stems | H.264 picture, compact AAC sound; widest playback compatibility |
| **MKV · archive** | Retaining lossless audio with the edit | Optional named FLAC tracks plus 24-bit WAV stems | Same H.264 picture; audio usually larger than AAC; some editors need remuxing |
| **WAV · audio master** | Audio-only podcast delivery/master | Finished stereo mix | 24-bit PCM at 48 kHz, about 1 GB/hour; no picture |

Separate-track exports include the finished mix first, then individual audio layers. Layer gain, mute/solo and processing are reflected in the stems; only the full mix receives loudness normalization. WAV stems provide a reliable import route for editors that do not expose multiple embedded audio streams. Each stem starts at the export's beginning, including silent gaps. In CapCut or other editors, avoid playing the full mix and all its component stems together.

The default target is −16 LUFS for a stereo podcast, with −14 and −20 options. The final mix uses true-peak-aware loudness processing with headroom, and final sample limiting; the delivered file's measured true peak is recorded in `Export-report.json`. These tools cannot repair distortion already captured at a microphone/interface. Very quiet/silent material may not have a meaningful loudness measurement.

## Shortcuts and practical limits

Space plays/pauses; S splits; Delete removes; Ctrl/Cmd C/X/V copies/cuts/pastes linked clips; Ctrl/Cmd D duplicates; Ctrl/Cmd Z and Shift Z undo/redo; Ctrl/Cmd S saves; I/O mark a range; arrows move one frame; M adds a marker. Shortcuts leave typing fields alone. Alt-drag bypasses timeline snapping.

- Projects support 16 layers, 256 media items, 2,000 clips and up to 12 hours. At most 8 visible picture clips and 16 audible clips may overlap. Undo retains up to 60 changes with an adaptive memory cap. Longer edits still require adequate disk space for PCM intermediate audio.
- Landscape 720p/1080p/4K, portrait 1080×1920 and square 1080×1080 at 24, 30 or 60 fps. This is SDR H.264 output; it is not an HDR/10-bit/color-managed finishing tool.
- Preview is at most 960×540 (portrait scales within that box), draws only while playing or changing, and releases media when leaving the editor. A bounded look-ahead warms nearby cuts. 4K source decoding can still be demanding: **Make lighter / compatible preview** makes a temporary 640-pixel proxy, while export uses originals. Effects and audio preview are approximations, not a frame-perfect reference monitor.
- MP4/MOV/MKV/WebM/AVI video, WAV/MP3/M4A/AAC/FLAC/Ogg/Opus audio, and PNG/JPEG/WebP images are accepted if the bundled decoder supports their contents. Animated images, variable-frame-rate sources, damaged files and less common codecs may require conversion. Source duration must be known; Latitude takes can supply it from their manifest.
- Only required active media is passed to each export section, with bounded encoder/filter threads. Exports run sequentially and can be canceled. Turning the editor off releases its runtime resources; the existing recorder and Streaming mod have no new production dependencies.
- Automatic subtitles/transcription, filler-word detection, speed ramps, keyframe animation, tracking, advanced grading, nested timelines and an executable-mod marketplace are not included. No AI service or paid editing API is used.
- Linux file-portal grants for media outside Videos can expire or change. Relink if necessary after restarting. SteamOS Desktop Mode and real GPU/device performance still need community testing.

Feedback: [Discord](https://discord.gg/EnPRdDutAn) or [GitHub issues](https://github.com/zphat/Latitude/issues). Include platform, source codec, project format, what you expected and the smallest reproducible example. Project files can contain local paths; review them before sharing.

## Arranging the workspace

Drag the divider between preview and timeline to give either more room. With the divider focused, Up/Down changes the balance in 5-point steps; Home/End selects the supported extremes. Double-click it for an even balance.

**Media** and **Inspector** toggle their panels without clearing a selection or changing any field. Media starts collapsed on smaller windows; use its button to import or reopen your library. Each panel and the timeline scroll independently. At high display scaling, the panels become drawers over the preview; close them for a clear picture. Very small effective windows scroll vertically, and long toolbars scroll horizontally or bring focused controls into view with Tab.

The panel choices and divider balance are remembered on this device. **Reset layout** restores a balanced workspace suited to the current window. Layout preferences are separate from project settings, undo history and export. No preview decoder is created when resizing or toggling panels.
