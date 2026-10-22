// Optional output transport. Loaded only when a streaming mod starts an output.
// H.264 is copied; only the already-processed PCM mix is encoded (AAC).
const { spawn } = require('node:child_process');
const net = require('node:net');
const tls = require('node:tls');
const { randomUUID } = require('node:crypto');

function validate(options = {}) {
  let server;
  try { server = new URL(options.server); } catch { throw Error('Enter a valid RTMPS or RTMP server URL.'); }
  if (!['rtmp:', 'rtmps:'].includes(server.protocol) || !server.hostname ||
      server.username || server.password || server.search || server.hash ||
      /[\s\x00-\x1f\x7f]/.test(options.server) || options.server.length > 1024 ||
      !server.pathname.slice(1).replace(/\/+$/, ''))
    throw Error('Use an RTMPS or RTMP server URL with an application path, without a key, query, or login.');
  const key = options.key;
  if (typeof key !== 'string' || !key.trim() || key.length > 1024 || /[\s\x00-\x1f\x7f]/.test(key))
    throw Error('Paste a stream key without spaces or line breaks.');
  const audioKbps = Number(options.audioKbps);
  if (![128, 160, 192, 256].includes(audioKbps)) throw Error('Choose a supported AAC bitrate.');
  return { server, key, audioKbps };
}
class StreamPublisher {
  constructor({ ffmpeg, onState = () => {}, tlsOptions = {} }) {
    this.ffmpeg = ffmpeg;
    this.onState = onState;
    // tlsOptions is test-only dependency injection; never exposed over IPC.
    this.tlsOptions = tlsOptions;
    this.session = null;
  }
  get active() { return !!this.session; }
  emit(s, state, message = '') {
    if (s !== this.session) return;
    s.state = state;
    this.onState({ id: s.id, state, message, bytes: s.bytes,
      seconds: s.seconds || 0, frames: s.frames || 0 });
  }
  async start(options) {
    if (this.session) throw Error('A streaming output is already active.');
    const { server, key, audioKbps } = validate(options);
    const s = { id: randomUUID(), bytes: 0, state: 'connecting', sockets: new Set(), closing: false };
    this.session = s;
    try {
      // Authenticate TLS here using Node's certificate and hostname verification.
      // FFmpeg versions bundled on Windows and Linux have different TLS backends.
      s.relay = net.createServer(local => {
        if (s.accepted || s.closing) { local.destroy(); return; }
        s.accepted = true;
        s.relay.close(); // one publisher, no persistent listening service
        const host = server.hostname.replace(/^\[|\]$/g, '');
        const opts = { host, port: Number(server.port) || (server.protocol === 'rtmps:' ? 443 : 1935) };
        const remote = server.protocol === 'rtmps:'
          ? tls.connect({ ...opts, ...this.tlsOptions, servername: net.isIP(host) ? undefined : host,
              rejectUnauthorized: true, checkServerIdentity: (_, cert) => tls.checkServerIdentity(host, cert) })
          : net.connect(opts);
        for (const sock of [local, remote]) {
          s.sockets.add(sock);
          sock.setNoDelay(true);
          sock.setTimeout(15000, () => this.fail(s, 'The streaming connection stopped responding.'));
          sock.on('error', () => this.fail(s, server.protocol === 'rtmps:'
            ? 'Could not establish or maintain the secure connection. Check the server, certificate, and internet connection.'
            : 'Could not establish or maintain the streaming connection. Check the server and internet connection.'));
        }
        remote.once('close', () => { if (!s.closing) this.fail(s, 'The streaming server disconnected.'); });
        local.on('data', data => { s.bytes += data.length; });
        local.pipe(remote); remote.pipe(local);
      });
      await new Promise((resolve, reject) => {
        s.relay.once('error', reject);
        s.relay.listen(0, '127.0.0.1', resolve);
      });
      if (s.closing) throw Error('Streaming start was cancelled.');
      const app = server.pathname.slice(1).replace(/\/+$/, '');
      const target = `rtmp://127.0.0.1:${s.relay.address().port}/${app}`;
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-probesize', '32768',
        '-analyzeduration', '100000', '-f', 'matroska', '-i', 'pipe:0',
        '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-c:a', 'aac',
        '-b:a', `${audioKbps}k`, '-ar', '48000', '-ac', '2',
        '-progress', 'pipe:3', '-stats_period', '1', '-flush_packets', '1',
        '-flvflags', 'no_duration_filesize', '-rtmp_app', app,
        '-rtmp_tcurl', server.href.replace(/\/$/, ''), '-rtmp_playpath', key,
        '-f', 'flv', target];
      s.process = spawn(this.ffmpeg, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore', 'pipe'] });
      // Never log argv or stderr: both can include a platform stream key.
      s.process.stdin.on('error', () => this.fail(s, 'The streaming encoder stopped accepting media.'));
      s.process.once('error', () => this.fail(s, 'The bundled streaming encoder could not start.'));
      s.exited = new Promise(resolve => s.process.once('close', code => {
        resolve(code);
        if (!s.closing) this.fail(s, 'The streaming server or encoder stopped. Check the server URL and stream key.');
      }));
      let progress = '';
      s.process.stdio[3].on('data', data => {
        progress = (progress + data.toString()).slice(-8192);
        const lines = progress.split('\n'); progress = lines.pop();
        for (const line of lines) {
          const [name, value] = line.split('=');
          if (name === 'out_time_us') s.seconds = Math.max(0, Number(value) / 1e6 || 0);
          if (name === 'frame') s.frames = Number(value) || 0;
          if (name === 'progress' && s.seconds > 0 && !s.closing) {
            clearTimeout(s.startTimeout);
            this.emit(s, 'sending');
          }
        }
      });
      s.startTimeout = setTimeout(() => this.fail(s, 'No media reached the streaming output within 20 seconds. Check the encoder and destination.'), 20000);
      this.emit(s, 'connecting');
      return { id: s.id };
    } catch (error) {
      await this.stop(s.id);
      throw error;
    }
  }
  async write(id, bytes) {
    const s = this.session;
    if (!s || s.id !== id || s.closing) throw Error('Streaming output is no longer active.');
    if (!(bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes)) || !bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024)
      throw Error('Invalid streaming packet.');
    if (s.writing) throw Error('Wait for the previous streaming packet.');
    s.writing = true;
    const data = Buffer.from(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Upload could not keep up. Lower the streaming bitrate.')), 4000);
        s.process.stdin.write(data, error => { clearTimeout(timer); error ? reject(Error('The streaming encoder stopped.')) : resolve(); });
      });
    } catch (error) {
      this.fail(s, error.message);
      throw error;
    } finally { s.writing = false; }
  }
  fail(s, message) {
    if (s !== this.session || s.closing) return;
    this.emit(s, 'failed', message);
    this.stop(s.id).catch(() => {});
  }
  async stop(id) {
    const s = this.session;
    if (!s || (id && s.id !== id)) return;
    if (s.stopping) return s.stopping;
    s.closing = true;
    s.stopping = (async () => {
      clearTimeout(s.startTimeout);
      s.process?.stdin.destroy();
      for (const sock of s.sockets) sock.destroy();
      s.relay?.close();
      if (s.process && s.process.exitCode === null) {
        s.process.kill();
        let timer;
        await Promise.race([s.exited, new Promise(resolve => { timer = setTimeout(() => { s.process.kill('SIGKILL'); resolve(); }, 1500); })]);
        clearTimeout(timer);
      }
      this.emit(s, 'stopped');
      if (this.session === s) this.session = null;
    })();
    return s.stopping;
  }
}
module.exports = { StreamPublisher, validate };
