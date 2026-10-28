const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
function validateEncoder(configuration) {
  if (configuration.includes('--enable-nonfree')) throw Error('Refusing to distribute a nonfree encoder');
  for (const flag of ['--enable-gpl', '--enable-libx264', '--enable-libvpx', '--enable-libopus', '--enable-libmp3lame'])
    if (!configuration.includes(flag)) throw Error(`Missing required encoder feature ${flag}`);
}
function validateLibraries(output) {
  const external = output.split('\n').slice(1).map(l=>l.trim()).filter(Boolean)
    .filter(l=>!/^\/(System\/Library|usr\/lib)\//.test(l));
  if (external.length) throw Error(`Non-system libraries are not portable: ${external.join('; ')}`);
}
function copyRuntimeNotices(electronRoot = path.resolve('node_modules/electron'), notices = path.resolve('vendor/mac')) {
  const dist = path.join(electronRoot, 'dist');
  const version = JSON.parse(fs.readFileSync(path.join(electronRoot, 'package.json'), 'utf8')).version;
  if (fs.readFileSync(path.join(dist, 'version'), 'utf8').trim().replace(/^v/, '') !== version)
    throw Error('Electron runtime version does not match the installed package');
  const files = [['LICENSE','Electron-LICENSE.txt'], ['LICENSES.chromium.html','Chromium-LICENSES.html']];
  for (const [source] of files)
    if (!fs.statSync(path.join(dist, source)).size) throw Error(`Empty Electron notice: ${source}`);
  fs.mkdirSync(notices, {recursive:true});
  for (const [source, dest] of files) fs.copyFileSync(path.join(dist, source), path.join(notices, dest));
}
function prepare() {
  if (process.platform !== 'darwin') throw Error('Run on macOS');
  const binary = path.resolve('vendor/ffmpeg');
  const configuration = execFileSync(binary, ['-buildconf'], {encoding:'utf8', stdio:['ignore','pipe','pipe']});
  validateEncoder(configuration);
  for (const file of ['ffmpeg', 'ffprobe']) {
    const dependencies = execFileSync('otool', ['-L', path.resolve('vendor', file)], {encoding:'utf8'});
    console.log(dependencies);
    validateLibraries(dependencies);
  }
  for (const name of ['ffmpeg/COPYING.GPLv2', 'x264/COPYING', 'libvpx/LICENSE', 'opus/COPYING', 'lame/COPYING', 'BUILD.json'])
    if (!fs.existsSync(path.join('vendor/mac', name))) throw Error(`Missing encoder notice ${name}`);
  copyRuntimeNotices();
  console.log(execFileSync(binary, ['-version'], {encoding:'utf8'}).split('\n')[0]);
  console.log('Verified redistributable encoder features, system-only libraries and runtime notices.');
}
if (require.main === module) {
  if (process.argv.includes('--runtime-notices-only')) copyRuntimeNotices();
  else prepare();
}
module.exports = {validateEncoder, validateLibraries, copyRuntimeNotices};
