const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {capturePlatform} = require('../electron/capture-platform.cjs');
const {validateEncoder} = require('../scripts/prepare-mac-encoder.cjs');
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
