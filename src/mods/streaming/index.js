import { StreamingSession } from './session.js';
let session, panel, unsubscribe, releaseStop;
export async function activate({ services }) {
  const ui = services['workspace-panel'];
  const capture = services['live-output'];
  const transport = services['stream-transport'];
  panel = ui.mount({ id: 'stream', title: 'Stream', icon: 'wave', html: `
    <div class="page-heading"><div><div class="eyebrow">LATITUDE MOD · BETA</div><h1>Your voice. On air.</h1></div><button class="button" id="stream-studio">Back to Studio</button></div>
    <div class="stream-status-card" data-state="idle"><div><span class="eyebrow">BROADCAST OUTPUT</span><h2 id="stream-state" role="status">Ready to connect</h2><p id="stream-message">Set up your scene and audio in Studio, then connect your platform here.</p></div><button class="button primary" id="stream-toggle">Start streaming</button></div>
    <div class="stream-grid"><section class="panel stream-settings"><h2>Destination</h2>
      <label>Platform preset<select id="stream-platform"><option value="twitch">Twitch · 6 Mb/s + 160 kb/s AAC</option><option value="youtube">YouTube · 10 Mb/s + 128 kb/s AAC</option><option value="custom">Custom RTMP / RTMPS</option></select></label>
      <p class="fine-print">Copy the server URL and stream key from your platform’s creator dashboard. Presets are starting points; your platform and upload connection set the limits.</p>
      <label>Server URL<input id="stream-server" type="url" autocomplete="off" spellcheck="false" placeholder="rtmps://your-ingest-server/app" maxlength="1024"></label>
      <p class="notice" id="stream-insecure" hidden>RTMP is unencrypted. Use your platform’s RTMPS address when available.</p>
      <label>Stream key<div class="stream-secret"><input id="stream-key" type="password" autocomplete="off" spellcheck="false" maxlength="1024" placeholder="Kept only for this session"><button class="button small" id="stream-show" type="button" aria-label="Show stream key">Show</button></div></label>
      <p class="fine-print">Your key is never saved in preferences, packs, or diagnostics. Clear it when you’re done on a shared computer.</p>
      <label class="check-line" id="stream-test-label"><input type="checkbox" id="stream-bandwidth-test"> Twitch bandwidth test · no public broadcast</label>
    </section><section class="panel stream-settings"><h2>Picture & sound</h2>
      <div class="stream-format"><strong id="stream-format"></strong><small>Uses the Studio canvas. Change resolution and frame rate in Settings before going live.</small></div>
      <label>Video bitrate · kb/s<input id="stream-video" type="number" min="1500" max="20000" step="500" value="6000"></label>
      <label>Audio quality<select id="stream-audio"><option value="128">128 kb/s AAC · YouTube preset</option><option value="160">160 kb/s AAC · Twitch preset</option><option value="192">192 kb/s AAC · rich stereo</option><option value="256">256 kb/s AAC · music, if supported</option></select></label>
      <p class="fine-print">The stream uses your finished stereo mix: voice processing, desktop ducking, mute controls, and the safety limiter. Audio is encoded once, at 48 kHz.</p>
      <p class="notice" id="stream-advice">Leave upload headroom. Try 720p / 30 fps and 3,500–4,500 kb/s on a modest connection.</p>
      <details><summary>Local recordings & connection behavior</summary><p>Start a local take from Studio whenever you need separate audio tracks. Recording and streaming have independent Stop controls. Pausing a recording keeps the broadcast running.</p><p>Latitude retries a lost connection three times (2, 4, then 8 seconds). Your local take continues. Exports wait until the stream ends to keep encoding resources available.</p><p>“Sending” confirms media is leaving Latitude. Check your platform’s dashboard for reception, privacy, audio sync, and the final Go Live button. Platform delivery still needs beta feedback.</p></details>
    </section></div>
    <div class="stream-stats" aria-label="Streaming statistics"><span>Output <b id="stream-time">00:00</b></span><span>Sent <b id="stream-bytes">0 MB</b></span><span>Skipped frames <b id="stream-dropped">0</b></span><span>Encoder <b id="stream-encoder">Off</b></span></div>
    <p class="fine-print">One destination at a time · H.264 / AAC · up to 1080p60. Streaming alone encodes video once; recording alongside it adds a separate recording encode. Use headphones with desktop audio.</p>` });
  const $ = selector => panel.element.querySelector(selector);
  session = new StreamingSession({ capture, transport });
  const prefs = ui.readSettings('streaming') || {};
  const profiles = { twitch: [6000, 160], youtube: [10000, 128], custom: [6000, 192] };
  if (Object.hasOwn(profiles, prefs.platform)) $('#stream-platform').value = prefs.platform;
  function profile() {
    const platform = $('#stream-platform').value;
    const [video, audio] = profiles[platform];
    $('#stream-video').value = video;
    $('#stream-audio').value = audio;
    $('#stream-test-label').hidden = platform !== 'twitch';
    $('#stream-bandwidth-test').checked = false;
  }
  profile();
  if (Number.isFinite(prefs.videoKbps) && prefs.videoKbps >= 1500 && prefs.videoKbps <= 20000) $('#stream-video').value = prefs.videoKbps;
  if ([128, 160, 192, 256].includes(prefs.audioKbps)) $('#stream-audio').value = prefs.audioKbps;
  function save() {
    ui.writeSettings('streaming', { platform: $('#stream-platform').value,
      videoKbps: Number($('#stream-video').value), audioKbps: Number($('#stream-audio').value) });
  }
  $('#stream-platform').onchange = () => { profile(); save(); };
  $('#stream-video').onchange = save;
  $('#stream-audio').onchange = save;
  $('#stream-server').oninput = () => { $('#stream-insecure').hidden = !$('#stream-server').value.trim().startsWith('rtmp:'); };
  $('#stream-show').onclick = () => {
    const input = $('#stream-key');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#stream-show').textContent = input.type === 'password' ? 'Show' : 'Hide';
    $('#stream-show').setAttribute('aria-label', `${input.type === 'password' ? 'Show' : 'Hide'} stream key`);
  };
  $('#stream-studio').onclick = () => ui.show('studio');
  $('#stream-toggle').onclick = async () => {
    try {
      if (session.active) { await session.stop(); return; }
      let key = $('#stream-key').value.trim();
      const server = $('#stream-server').value.trim();
      if (!server || !key) throw Error('Add the server URL and stream key from your platform dashboard first.');
      if ($('#stream-bandwidth-test').checked && $('#stream-platform').value === 'twitch') key += key.includes('?') ? '&bandwidthtest=true' : '?bandwidthtest=true';
      $('#stream-key').type = 'password';
      $('#stream-show').textContent = 'Show';
      await session.start({ server, key, videoKbps: Number($('#stream-video').value), audioKbps: Number($('#stream-audio').value) });
    } catch (error) { ui.toast(error.message, true); }
  };
  function render() {
    const s = session.state, on = session.active;
    const titles = { idle: 'Ready to connect', connecting: 'Connecting…', sending: 'Sending to platform', reconnecting: 'Connection interrupted', failed: 'Stream stopped' };
    $('#stream-state').textContent = titles[s.state] || s.state;
    $('#stream-message').textContent = s.state === 'sending' ? 'Media is leaving Latitude. Check your platform dashboard before announcing that you’re live.' : s.message || 'Configure your destination, then start when you’re ready.';
    $('.stream-status-card').dataset.state = s.state;
    $('#stream-toggle').textContent = on ? 'End stream' : 'Start streaming';
    $('#stream-toggle').classList.toggle('danger', on);
    panel.element.querySelectorAll('.stream-settings input, .stream-settings select').forEach(el => { el.disabled = on; });
    $('#stream-time').textContent = `${Math.floor((s.seconds || 0) / 60).toString().padStart(2, '0')}:${Math.floor((s.seconds || 0) % 60).toString().padStart(2, '0')}`;
    $('#stream-bytes').textContent = `${((s.bytes || 0) / 1e6).toFixed(1)} MB`;
    $('#stream-dropped').textContent = s.dropped || 0;
    $('#stream-encoder').textContent = on ? s.encoder || 'Starting' : 'Off';
    const f = capture.format();
    $('#stream-format').textContent = `${f.width} × ${f.height} · ${f.fps} fps`;
    panel.status({ active: on, label: s.state === 'sending' ? 'Sending' : on ? titles[s.state] || 'Stream active' : 'Stream', stop: () => session.stop() });
  }
  session.addEventListener('change', render);
  window.addEventListener('latitude-view', render);
  unsubscribe = () => window.removeEventListener('latitude-view', render);
  releaseStop = capture.setStop(() => session.stop());
  render();
}
export async function deactivate() {
  unsubscribe?.();
  await session?.dispose();
  releaseStop?.();
  panel?.remove();
  session = panel = unsubscribe = null;
}
