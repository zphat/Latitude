const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
test("desktop publication still requires exact native live updater verification on Windows and Linux", () => {
  const read = name => fs.readFileSync(path.join(__dirname, "../.github/workflows", name), "utf8");
  const release = read("release.yml"), live = read("updater-live.yml"), linux = read("linux.yml");
  assert.match(release, /publish:\s*\n\s*needs: \[validate, package, linux, live-updater\]/);
  assert.match(release, /live-updater:\s*\n\s*needs: validate\s*\n\s*uses: \.\/\.github\/workflows\/updater-live.yml/);
  assert.match(live, /os: \[ubuntu-24\.04, windows-latest\]/);
  assert.match(live, /LATITUDE_UPDATE_LIVE_CHECK: '1'/);
  assert.match(live, /run: node tests\/updater-ui.cjs/);
  assert.match(live, /run: npm run setup/);
  assert.ok(!/continue-on-error:\s*true/.test(live + release));
  assert.match(linux, /separate_updater_gate:[\s\S]*?type: boolean\s*\n\s*default: false/);
  assert.match(linux, /inputs\.separate_updater_gate && '0' \|\| '1'/);
  assert.match(release, /separate_updater_gate: true/);
});
