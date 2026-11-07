# Choosing your recording's files

Latitude saves recoverable MKV/WebM video and separate WAV originals (24-bit processed audio by default, with optional 32-bit float storage and float raw mic safety copies) while recording. Your preferred export format is made after you stop; this keeps conversion out of the live capture path. Settings supplies the automatic-export defaults. Takes → Export can override them for one take, or remember the new choice. Every attempt uses a new export folder.

## Three suggested video formats

- **MP4 (H.264 + AAC):** the default for sharing and CapCut. The mix is the default audio stream. With separate sources on, each recorded mic and desktop source is another named stream. Some editors expose only the mix; enable WAV editing files or per-source video copies for those workflows.
- **MKV (H.264 + 24-bit FLAC):** keep lossless audio inside the video container. FLAC compresses the same 24-bit samples used in WAV editing files. Editor support varies; keep the originals and re-export to MP4 if needed. The video is still compressed H.264, not lossless video.
- **MOV (H.264 + 24-bit PCM):** uncompressed audio in a QuickTime container for editing. Larger audio than MP4 or MKV. This is not a ProRes export and does not reconstruct extra picture detail.

**Original** video quality copies an existing H.264 picture stream without re-encoding it in these three containers. VP8 capture is converted to H.264 when exporting to these formats. Switching the container alone does not make the picture smaller. Select **Smallest** or **Smaller** picture quality beside Record before capturing to lower future video bitrates. **Balanced compression** or **Smaller file** at export re-encode existing footage at the same resolution and frame rate; they cost more CPU/time and can visibly reduce detail, especially text and fast motion. Already-efficient footage may not shrink.

## Other choices

**WebM (VP9 + Opus)** is an open web format, with optional multiple embedded audio tracks. VP9 conversion can save space depending on the scene, but adds encoding time, CPU use and another lossy generation. It is an optional export, not the low-resource default. Video encoding is capped at four threads and runs after recording. A compatible VP9 source can be copied.

**WAV, FLAC, MP3 and M4A** are audio-only exports. The main file is `Mix.<extension>`. With separate sources on, each mic/desktop source gets its own file in that format. They are not packaged as independently selectable source tracks inside one audio file. WAV and FLAC preserve the same decoded 24-bit samples and are the editing choices. MP3 and AAC/M4A are lossy delivery choices; decoder handling of encoder delay can differ between editors. Existing video is retained in the take folder and can be exported later.

WAV uses RF64 when a file exceeds RIFF's size limit. Confirm your editor supports RF64 for long sessions. Audio remains at the recording sample rate (normally 48 kHz); Opus is delivered at 48 kHz, including when the original source rate was 44.1 kHz.

## Size guide

Numbers below use decimal MB/GB and exclude metadata, video and original recordings.

| Choice                                    |                                                                        Approximate audio space |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------: |
| 48 kHz / 24-bit stereo PCM                |                                                                                   1.04 GB/hour |
| 48 kHz / 24-bit mono PCM                  |                                                                                   0.52 GB/hour |
| Mix + two mono mics + stereo desktop, PCM |                                                                                   3.11 GB/hour |
| 192 kbps MP3 or target-rate M4A           |                                                                            86 MB/hour per file |
| 256 kbps AAC in MP4                       |                     Up to roughly 115 MB/hour per track at the target rate; actual size varies |
| FLAC                                      | Content dependent; typically smaller than PCM speech, with no change to decoded 24-bit samples |

For the smallest audio-only delivery from these choices, start with MP3 or M4A and turn separate sources off if you need only a finished mix. For video, MP4 is the easiest balanced choice; Smallest/Smaller capture quality or explicit video compression matters more than MP4 versus MKV as a container. WebM may give a smaller picture at the cost of conversion work. There is no universally smallest format across all scenes and quality levels.

**Also save separate editing files** adds the processed mix and selected sources as 24-bit WAV or lossless FLAC. FLAC decodes to the same 24-bit samples as WAV and is often much smaller for speech; check your editor supports it. WAV packs also include raw float mic backups if recorded. FLAC packs leave those backups in the original take folder. Turning it off avoids those copies and the intermediate mix WAV. **A video copy for each isolated source** duplicates the picture for each source; it copies the already encoded streams instead of encoding the video again. These copies retain the chosen format. Choose MP4 for the CapCut workflow.

Takes shows the total size of delivered media, excluding small reports and the separately retained originals. Original recordings are never deleted by an export. Plan disk space for both originals and exports.

## Quick space-saving choices

- **Studio → Picture quality / size** shows a video-only space estimate. At 1080p30, targets are 3.5 / 5.85 / 12 / 20 Mbps from Smallest to High detail. Actual encoder output depends on the scene and device. Try Smallest for speech/documents and Smaller for general recording; detailed gameplay may need Balanced or High detail.
- **Export → Use space-saving export settings** selects Balanced video compression and 192 kbps audio, skips duplicate editing files and per-source video copies, and preserves your separate-source choice. Original takes and older exports remain intact; compressing an export does not automatically free that storage.
- Compressed audio offers 128 / 192 / 256 / 320 kbps per track. Lossless formats ignore this setting. 128 is the smallest speech delivery option; use higher rates for complex stereo material or repeated editing.
- New processed recordings default to **24-bit PCM**, saving 25% of their audio storage versus float32. Raw mic safety copies stay float32. Settings can retain float32 processed recordings or explicitly disable raw backups; disabling backups saves about 0.69 GB/hour per active mono mic at 48 kHz but removes the unprocessed safety copy. Processed mic and desktop tracks remain isolated. Existing recordings are not converted.
- Compression runs after recording, with bounded encoder threads. Choosing **Original** and skipping extra files is faster. It is a size/quality/time tradeoff, not free compression.

## Audio safety and compatibility

Only the full mix is loudness-normalized. Isolated sources keep their recording levels and processing. Live input mute also applies to raw mic backups. The actual delivered mix is measured again for loudness and true peak, including lossy formats. Avoid playing Full mix and all its component tracks together.

No export format repairs hardware clipping or guarantees that every editor will expose alternate tracks. Make a short clap/tone test in your actual editor before an important session. A damaged video capture can still allow an audio-only recovery export when the PCM originals are intact.

## Technical references

- [FFmpeg format and muxer documentation](https://www.ffmpeg.org/ffmpeg-formats.html)
- [FFmpeg codec options](https://ffmpeg.org/ffmpeg-codecs.html)
- [FFmpeg explicit stream mapping and stream copy](https://www.ffmpeg.org/ffmpeg.html)
- [WebM container guidelines](https://www.webmproject.org/docs/container/)
- [FLAC documentation](https://xiph.org/flac/documentation.html)
- [Mozilla media container guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers)

The actual bundled encoder is exercised by `tests/formats.test.cjs` on Windows before a release can publish. Format availability is an explicit tested list, not an arbitrary FFmpeg command input.
