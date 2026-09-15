import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('privacy',Path(__file__).resolve().parents[1]/'scripts/privacy_scan.py')
scanner=importlib.util.module_from_spec(spec);spec.loader.exec_module(scanner)

class PrivacyTests(unittest.TestCase):
    def scan_text(self,text,name='sample.txt',terms=()):
        with tempfile.TemporaryDirectory() as tmp:
            old=scanner.ROOT
            try:
                scanner.ROOT=Path(tmp);(scanner.ROOT/name).write_text(text)
                return scanner.scan(terms)
            finally: scanner.ROOT=old
    def test_detects_tokens_without_echoing_them(self):
        value='ghp_'+'X'*40
        report=self.scan_text(value)
        self.assertFalse(report['ok']);self.assertNotIn(value,json.dumps(report))
    def test_private_terms_are_not_echoed(self):
        term='fictional'+' private identity'
        report=self.scan_text(term,terms=[term])
        self.assertFalse(report['ok']);self.assertNotIn(term,json.dumps(report))
    def test_private_config_filename_is_rejected(self):
        self.assertFalse(self.scan_text('{}','connection.json')['ok'])
    def test_empty_public_config_is_allowed(self):
        self.assertTrue(self.scan_text('{"role":"","aliases":[]}','profile.example.json')['ok'])
