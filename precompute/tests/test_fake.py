import math
import unittest

from mars_ocean.fake import EAST_ZMIN, WEST_ZMIN, build_fake_grid
from mars_ocean.hexgrid import hex_ring, iter_hex_centers, split_antimeridian
from mars_ocean.volume import invert_volume, volume_at, west_volume


class HexGridTests(unittest.TestCase):
    def test_ring_is_closed(self) -> None:
        ring = hex_ring(10.0, 20.0, 150_000.0)
        self.assertEqual(len(ring), 7)
        self.assertEqual(ring[0], ring[-1])

    def test_antimeridian_split(self) -> None:
        ring = hex_ring(0.0, 179.6, 150_000.0)
        parts = split_antimeridian(ring)
        self.assertGreaterEqual(len(parts), 1)
        for part in parts:
            lons = [p[0] for p in part]
            self.assertLessEqual(max(lons) - min(lons), 180.0)
            self.assertGreaterEqual(min(lons), -180.0)
            self.assertLessEqual(max(lons), 180.0)

    def test_center_count_ballpark(self) -> None:
        centers = iter_hex_centers(150_000.0)
        self.assertGreater(len(centers), 4000)
        self.assertLess(len(centers), 10_000)

    def test_voronoi_covers_every_center(self) -> None:
        from mars_ocean.voronoi import voronoi_geometries

        centers = iter_hex_centers(400_000.0)
        geoms = voronoi_geometries(centers)
        self.assertEqual(len(geoms), len(centers))
        for geom in geoms:
            self.assertIn(geom["type"], ("Polygon", "MultiPolygon"))
            if geom["type"] == "Polygon":
                ring = geom["coordinates"][0]
            else:
                ring = geom["coordinates"][0][0]
            self.assertEqual(ring[0], ring[-1])
            self.assertGreaterEqual(len(ring), 4)


class FakeCurveTests(unittest.TestCase):
    def test_schema_and_west_east(self) -> None:
        grid = build_fake_grid(spacing_km=400.0, bin_count=8)
        meta = grid["meta"]
        self.assertEqual(len(meta["stages"]), 8)
        self.assertEqual(meta["curve"], "fake")
        west = next(f for f in grid["features"] if f["properties"]["fillRate"] == "fast")
        east = next(f for f in grid["features"] if f["properties"]["fillRate"] == "slow")
        self.assertEqual(west["properties"]["zMin"], WEST_ZMIN)
        self.assertEqual(east["properties"]["zMin"], EAST_ZMIN)
        self.assertEqual(west["properties"]["volumes"][0], 0.0)
        self.assertEqual(east["properties"]["volumes"][0], 0.0)
        self.assertEqual(len(west["properties"]["volumes"]), 8)
        stages = meta["stages"]
        self.assertEqual(stages[0], meta["z_global_min"])
        self.assertEqual(stages[-1], meta["z_global_max"])

    def test_mid_volume_is_still_west(self) -> None:
        grid = build_fake_grid(spacing_km=400.0, bin_count=32)
        stages = grid["meta"]["stages"]
        global_v = [0.0] * len(stages)
        for feat in grid["features"]:
            vols = feat["properties"]["volumes"]
            for i, v in enumerate(vols):
                global_v[i] += v
        mid = 0.5 * global_v[-1]
        h = invert_volume(mid, stages, global_v)
        self.assertLess(h, EAST_ZMIN)
        self.assertGreater(h, WEST_ZMIN)

    def test_invert_roundtrip(self) -> None:
        stages = [-8000.0, -4000.0, 0.0]
        global_v = [0.0, 50.0, 100.0]
        h = invert_volume(25.0, stages, global_v)
        self.assertAlmostEqual(h, -6000.0)
        self.assertAlmostEqual(volume_at(h, stages, global_v), 25.0)

    def test_west_column_grows_past_zmin(self) -> None:
        a = 1e10
        v0 = west_volume(-7200.0, a, -7200.0, 0.0)
        v1 = west_volume(-3600.0, a, -7200.0, 0.0)
        v2 = west_volume(0.0, a, -7200.0, 0.0)
        self.assertEqual(v0, 0.0)
        self.assertAlmostEqual(v1, a * 3600.0)
        self.assertAlmostEqual(v2, a * 7200.0)
        self.assertGreater(v2, v1)


if __name__ == "__main__":
    unittest.main()
