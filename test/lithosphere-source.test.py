import importlib.util
import tarfile
import unittest

spec=importlib.util.spec_from_file_location('lithosphere','scripts/setup-lithosphere.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class LithosphereSourceTest(unittest.TestCase):
    def test_retained_node_boundaries_and_invalid_order(self):
        with tarfile.open(module.ARCHIVE) as source:
            text=source.extractfile('LITHO1.0/litho_model/node1.model').read().decode()
        values=module.boundaries(text)
        self.assertEqual(len(values),36)
        self.assertEqual(values[::9],[17250,71848,71848,171848])
        self.assertEqual(values[1:4],[3300,8155,4646.72])
        with self.assertRaisesRegex(ValueError,'ordering'):
            module.boundaries(text.replace('  17250.  3300.00','  90000.  3300.00'))
        with self.assertRaisesRegex(ValueError,'Missing'):
            module.boundaries(text.replace('LID-TOP','UNKNOWN'))

if __name__=='__main__':
    unittest.main()
