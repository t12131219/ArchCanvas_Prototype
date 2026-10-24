"""The accepted source presentation survives publication and catalog rebuilds."""
import contextlib
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from semantic_adapter.schema import seal
from tools import build_semantic_catalog as builder
from tools.publish_reviewed_presentation import publish_reviewed

ROOT = Path(__file__).resolve().parents[1]


class ReviewedPublicationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for name in ['verification/input-placement/current/suite-report.json',
                     'verification/helper-contracts/current/Transformer-current.json',
                     'data/semantic/catalog.json']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)

    def read(self, path):
        return json.loads((self.root / path).read_text())

    def test_publication_is_repeatable_and_preserves_other_models(self):
        before = self.read('data/semantic/catalog.json')
        receipt = publish_reviewed(self.root)
        files = [receipt['ir'], receipt['profile'], 'data/semantic/catalog.json']
        first = [(self.root / path).read_bytes() for path in files]
        self.assertEqual(publish_reviewed(self.root), receipt)
        self.assertEqual(first, [(self.root / path).read_bytes() for path in files])
        catalog = self.read('data/semantic/catalog.json')
        self.assertEqual(catalog['models'][0]['id'], catalog['default_model'])
        self.assertEqual({m['id'] for m in before['models']}, {m['id'] for m in catalog['models']})

    def test_catalog_rebuild_cannot_restore_old_input_or_drop_the_reviewed_frontier(self):
        ordinary = json.loads((ROOT / 'data/semantic/d6df94c94e8a5888.json').read_text())

        def fresh_extraction(path, cls, cell=None):
            # Simulate valid, newly extracted facts that have not been selected
            # as the accepted product input. No external source is executed.
            result = json.loads(json.dumps(ordinary))
            result['entry'].update(file=str(path), **{'class': cls, 'cell': cell})
            result['title'] = cls
            return seal(result)

        inventory = {'files': [], 'models': [], 'github_links': []}
        with patch.object(builder, 'ROOT', self.root), \
                patch.object(builder, 'inventory', return_value=inventory), \
                patch.object(builder, 'analyze', side_effect=fresh_extraction), \
                contextlib.redirect_stdout(io.StringIO()):
            builder.main()
        catalog = self.read('data/semantic/catalog.json')
        model = next(m for m in catalog['models'] if m['id'] == catalog['default_model'])
        profile = self.read('data/semantic/' + model['presentation'])
        self.assertEqual((self.root / ('data/semantic/' + model['ir'])).read_bytes(),
                         (self.root / profile['audit']['input']).read_bytes())
        self.assertEqual(profile['default_state']['paperGranularity'], 'roles')
        self.assertTrue(profile['default_state']['paperFrontierReturn'])
        self.assertEqual(model['nodes'], 3371)

    def test_changed_audit_input_is_rejected_before_product_files_are_written(self):
        catalog = (self.root / 'data/semantic/catalog.json').read_bytes()
        source = self.root / 'verification/helper-contracts/current/Transformer-current.json'
        source.write_bytes(source.read_bytes() + b'\n')
        with self.assertRaisesRegex(ValueError, 'Audited source IR changed'):
            publish_reviewed(self.root)
        self.assertEqual((self.root / 'data/semantic/catalog.json').read_bytes(), catalog)
        self.assertFalse((self.root / 'data/semantic/0216717d966327f4.json').exists())


if __name__ == '__main__':
    unittest.main()
