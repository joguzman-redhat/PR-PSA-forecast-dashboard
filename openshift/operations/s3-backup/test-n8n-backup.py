#!/usr/bin/env python3
"""Offline regression for Kubernetes Scale omitting zero replicas."""
import importlib.util
from pathlib import Path
import unittest
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('n8n_backup', Path(__file__).with_name('n8n-backup.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class ScaleZeroRegression(unittest.TestCase):
    def maintenance(self):
        # Avoid credentials and HTTP; responses use the real Scale JSON shape.
        maintenance = backup.Maintenance.__new__(backup.Maintenance)
        maintenance.original_replicas = 1
        maintenance.stop_attempted = True
        return maintenance

    def test_omitted_zero_replicas_is_stopped(self):
        maintenance = self.maintenance()
        maintenance.request = lambda path: {'spec': {}} if path == backup.SCALE else {'items': []}
        maintenance.ensure_stopped()

    def test_restore_from_omitted_zero_preserves_resource_version(self):
        maintenance = self.maintenance()
        patches = []
        def request(path, body=None):
            self.assertEqual(path, backup.SCALE)
            if body is not None:
                patches.append(body)
                return {'spec': {'replicas': 1}}
            return {'metadata': {'resourceVersion': '42'}, 'spec': {}}
        maintenance.request = request
        maintenance.restore()
        self.assertEqual(patches, [{'metadata': {'resourceVersion': '42'}, 'spec': {'replicas': 1}}])
        self.assertFalse(maintenance.stop_attempted)

    def test_safe_error_chain_omits_response_reason_and_secrets(self):
        try:
            try:
                raise HTTPError('https://example.invalid/private', 403, 'Bearer secret-token', {}, None)
            except HTTPError as error:
                error.close()
                raise RuntimeError('secret-token') from error
        except RuntimeError as error:
            diagnostic = backup.safe_error_chain(error)
        self.assertEqual(diagnostic, 'RuntimeError <- HTTPError HTTP 403 Forbidden')


if __name__ == '__main__':
    unittest.main()
