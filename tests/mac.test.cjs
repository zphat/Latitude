const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {capturePlatform} = require('../electron/capture-platform.cjs');
test('macOS requests native system audio with explicit privacy declarations', () => {
 assert.equal(capturePlatform('darwin', {}).desktopAudio, 'loopback');
 const pkg = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../package.json')));
 assert.equal(pkg.build.mac.minimumSystemVersion, '14.2');
 for (const key of ['NSAudioCaptureUsageDescription','NSCameraUsageDescription','NSMicrophoneUsageDescription'])
  assert.ok(pkg.build.mac.extendInfo[key].length > 10);
});
