"""Release publication is exercised with fake assets and a fake GitHub API."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('mac_release', Path(__file__).resolve().parents[1] / 'scripts/publish-mac-preview.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class MacRelease(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'package.json').write_text('{"version":"0.9.4"}')
        self.assets = self.root / 'release-assets'
        self.assets.mkdir()
        self.event = self.root / 'event.json'
        self.event.write_text(json.dumps({'head_commit': {'message': 'Publish Latitude macOS preview v0.9.4'}}))
        self.remote = {'draft': False, 'prerelease': True, 'assets': [{'name': 'SHA256SUMS.txt', 'id': 1, 'digest': 'sha256:untouched'}]}
        self.calls = []
        for arch in ['arm64', 'x64']:
            lines = []
            for ext in ['.dmg', '.zip', '-Encoder-Sources.tar.gz']:
                name = f'Latitude-0.9.4-macOS-{arch}{ext}'
                file = self.assets / name
                file.write_text(name)
                lines.append(f'{hashlib.sha256(file.read_bytes()).hexdigest()}  {name}\n')
            (self.assets / f'SHA256SUMS-macOS-{arch}.txt').write_text(''.join(lines))
        self.enterContext(patch.object(release, 'ROOT', self.root))
        self.enterContext(patch.object(release, 'gh', self.gh))
        self.enterContext(patch.dict(os.environ, GITHUB_EVENT_PATH=str(self.event), GH_REPO='zphat/Latitude'))

    def gh(self, *args):
        self.calls.append(args)
        if args[0] == 'api':
            return json.dumps(self.remote)
        if args[:2] == ('release', 'upload'):
            file = Path(args[3])
            self.assertNotIn(file.name, [a['name'] for a in self.remote['assets']])
            self.remote['assets'].append({'name': file.name, 'id': len(self.remote['assets']) + 1,
                                         'digest': 'sha256:' + hashlib.sha256(file.read_bytes()).hexdigest()})
        return ''

    def test_complete_preview_preserves_existing_assets_and_rerun_is_idempotent(self):
        before = self.remote['assets'][0].copy()
        release.publish()
        self.assertEqual(len(self.remote['assets']), 8)
        self.assertEqual(self.remote['assets'][0], before)
        self.calls.clear()
        release.publish()
        self.assertFalse(any(c[:2] == ('release', 'upload') for c in self.calls))

    def test_corrupt_asset_is_rejected_before_upload(self):
        (self.assets / 'Latitude-0.9.4-macOS-x64.zip').write_text('corrupt')
        with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
            release.publish()
        self.assertFalse(any(c[0] == 'release' for c in self.calls))

    def test_existing_download_cannot_be_replaced(self):
        self.remote['assets'].append({'name': 'Latitude-0.9.4-macOS-arm64.dmg', 'id': 2, 'digest': 'sha256:other'})
        with self.assertRaisesRegex(RuntimeError, 'refusing to replace'):
            release.publish()
        self.assertFalse(any(c[0] == 'release' for c in self.calls))

    def test_stable_release_and_unintentional_commit_are_rejected(self):
        self.remote['prerelease'] = False
        with self.assertRaisesRegex(RuntimeError, 'existing published beta'):
            release.publish()
        self.event.write_text(json.dumps({'head_commit': {'message': 'An unrelated documentation update'}}))
        with self.assertRaisesRegex(RuntimeError, 'explicit matching'):
            release.publish()
        self.assertFalse(any(c[0] == 'release' for c in self.calls))

    def test_missing_architecture_is_rejected(self):
        (self.assets / 'SHA256SUMS-macOS-x64.txt').write_text('')
        with self.assertRaisesRegex(RuntimeError, 'Incomplete'):
            release.publish()
        self.assertFalse(any(c[0] == 'release' for c in self.calls))


if __name__ == '__main__':
    unittest.main()
