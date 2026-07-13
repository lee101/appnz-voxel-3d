import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))
import contract as MODULE


class ContractTest(unittest.TestCase):
    def test_voxel_presets_map_to_bounded_grids(self):
        self.assertIsNone(MODULE.voxel_resolution("mesh"))
        self.assertEqual(MODULE.voxel_resolution("voxel48"), 48)

    def test_unknown_style_is_rejected(self):
        with self.assertRaises(ValueError):
            MODULE.voxel_resolution("lego")

    def test_marching_cubes_resolution_is_bounded(self):
        self.assertEqual(MODULE.validate_resolution(192), 192)
        with self.assertRaises(ValueError):
            MODULE.validate_resolution(512)


if __name__ == "__main__":
    unittest.main()
