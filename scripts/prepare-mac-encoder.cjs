const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
if (process.platform !== 'darwin') throw Error('Run on macOS');
const binary = require('ffmpeg-static');
execFileSync(binary, ['-version']);
fs.mkdirSync('vendor/mac', {recursive:true});
fs.copyFileSync(binary, 'vendor/ffmpeg');
fs.chmodSync('vendor/ffmpeg', 0o755);
for (const suffix of ['LICENSE','README']) {
 const source = `${binary}.${suffix}`;
 if (!fs.existsSync(source)) throw Error(`Missing encoder notice ${suffix}`);
 fs.copyFileSync(source, path.join('vendor/mac', `FFmpeg-${suffix}.txt`));
}
