import math
import unittest
from datetime import UTC, datetime
from pathlib import Path

from import_voyager1 import (
    KernelSource, adaptive_samples, guarded_intervals, hermite,
    interpolate_row, verify_digest,
)


class ImportTests(unittest.TestCase):
    def test_hermite_reproduces_cubic(self):
        self.assertAlmostEqual(hermite(0, 8, 0, 12, 2, 0.25), 0.125)

    def test_interpolation_reproduces_position_and_velocity(self):
        a = [0, 0, 1, 2, 0, 0, 0, 10, 20, 30, 1, 2, 3]
        b = [2000, 8, 1, 2, 12, 0, 0, 12, 24, 36, 1, 2, 3]
        row = interpolate_row(a, b, 500)
        self.assertAlmostEqual(row[1], 0.125)
        self.assertAlmostEqual(row[4], 0.75)
        self.assertEqual(row[7:10], [10.5, 21, 31.5])
        with self.assertRaises(ValueError):
            interpolate_row(a, b, 2001)

    def test_guard_windows_are_inside_each_source_segment(self):
        self.assertEqual(guarded_intervals([1000.1, 2000.2, 3000.3]), [
            (1002, 1999), (2002, 2999),
        ])

    def test_invalid_or_too_short_intervals_fail(self):
        for boundaries in [[2, 1], [1, 1], [1, math.nan], [1, math.inf], [1, 2]]:
            with self.subTest(boundaries=boundaries), self.assertRaises(ValueError):
                guarded_intervals(boundaries)

    def test_adaptive_sampler_resolves_curvature(self):
        def quartic(ms):
            t = ms / 1000
            return [ms, t**4, 0, 0, 4*t**3, 0, 0, 10+t, 20, 30, 1, 0, 0]
        rows = adaptive_samples(0, 8000, quartic)
        self.assertGreater(len(rows), 2)
        self.assertEqual(rows[0][0], 0)
        self.assertEqual(rows[-1][0], 8000)
        for a, b in zip(rows, rows[1:]):
            for fraction in [0.13, 0.37, 0.63, 0.89]:
                ms = a[0] + (b[0] - a[0]) * fraction
                self.assertLessEqual(abs(interpolate_row(a, b, ms)[1] - (ms/1000)**4), 0.25)

    def test_nonfinite_source_output_fails(self):
        with self.assertRaisesRegex(ValueError, "finite"):
            adaptive_samples(0, 8000, lambda t: [t] + [math.nan]*12)

    def test_bad_source_digest_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            verify_digest(Path(__file__), "0"*64)

    def test_spice_query_uses_utc_sun_and_fixed_j2000_ecliptic(self):
        root = Path(__file__).resolve().parents[1] / ".artifacts/spacecraft-sources/voyager1-jupiter"
        with KernelSource(root) as source:
            ms = datetime(1979, 3, 5, 12, 5, tzinfo=UTC).timestamp()*1000
            row = source.sample(ms)
            for actual, expected in zip(row[1:4], [-481994967.1499094, 627777863.3718998, 8199595.609038751]):
                self.assertAlmostEqual(actual, expected, delta=0.0001)
            for actual, expected in zip(row[7:10], [-482178195.5477377, 627481722.265265, 8220894.153412005]):
                self.assertAlmostEqual(actual, expected, delta=0.0001)
            self.assertEqual(len(source.intervals), 6)
            self.assertLess(source.intervals[0][0], ms)
            self.assertGreater(source.intervals[-1][1], ms)


if __name__ == "__main__":
    unittest.main()
