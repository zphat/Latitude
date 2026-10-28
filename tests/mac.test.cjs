const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {capturePlatform} = require('../electron/capture-platform.cjs');
const {validateEncoder, validateLibraries, copyRuntimeNotices} = require('../scripts/prepare-mac-encoder.cjs');
test('Mac packaging retains exact runtime notices and rejects missing, empty or mismatched distributions', () => {
 const path = require('node:path');
 const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'latitude-runtime-notices-'));
 try {
  const dist = path.join(root, 'dist'), notices = path.join(root, 'notices');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({version:'44.8.0'}));
  fs.writeFileSync(path.join(dist, 'version'), 'v44.8.0\n');
  fs.writeFileSync(path.join(dist, 'LICENSE'), 'Electron license fixture\n');
  assert.throws(() => copyRuntimeNotices(root, notices), /ENOENT/);
  assert.equal(fs.existsSync(notices), false);
  fs.writeFileSync(path.join(dist, 'LICENSES.chromium.html'), '<html>Chromium license fixture</html>');
  copyRuntimeNotices(root, notices);
  assert.equal(fs.readFileSync(path.join(notices, 'Electron-LICENSE.txt'), 'utf8'), 'Electron license fixture\n');
  assert.equal(fs.readFileSync(path.join(notices, 'Chromium-LICENSES.html'), 'utf8'), '<html>Chromium license fixture</html>');
  fs.writeFileSync(path.join(dist, 'version'), '44.7.0');
  assert.throws(() => copyRuntimeNotices(root, notices), /version/);
  fs.writeFileSync(path.join(dist, 'version'), '44.8.0');
  fs.writeFileSync(path.join(dist, 'LICENSES.chromium.html'), '');
  assert.throws(() => copyRuntimeNotices(root, notices), /Empty/);
 } finally { fs.rmSync(root, {recursive:true, force:true}); }
});
test('Mac packages require system-only dynamic libraries and report offending paths', () => {
 const system = 'ffmpeg:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n\t/System/Library/Frameworks/VideoToolbox.framework/Versions/A/VideoToolbox\n';
 assert.doesNotThrow(() => validateLibraries(system));
 for (const external of ['/usr/local/opt/xz/lib/liblzma.5.dylib', '/opt/homebrew/lib/libz.dylib', '@rpath/libopus.dylib'])
   assert.throws(() => validateLibraries(system + '\t' + external + '\n'), error => error.message.includes(external));
});
test('Mac packaging rejects nonfree encoders and missing export codecs', () => {
 const config = '--enable-gpl --enable-libx264 --enable-libvpx --enable-libopus --enable-libmp3lame';
 assert.doesNotThrow(() => validateEncoder(config));
 assert.throws(() => validateEncoder(config + ' --enable-nonfree'), /nonfree/);
 for (const flag of config.split(' ')) assert.throws(() => validateEncoder(config.replace(flag, '')), /Missing/);
});
test('macOS requests native system audio with explicit privacy declarations', () => {
 assert.equal(capturePlatform('darwin', {}).desktopAudio, 'loopback');
 const pkg = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../package.json')));
 assert.equal(pkg.build.mac.minimumSystemVersion, '14.2');
 for (const key of ['NSAudioCaptureUsageDescription','NSCameraUsageDescription','NSMicrophoneUsageDescription'])
  assert.ok(pkg.build.mac.extendInfo[key].length > 10);
});
