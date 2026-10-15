"""Generate numerical replay assets from the original NASA PDS kernels."""

import argparse
import bisect
import hashlib
import json
import math
from contextlib import ExitStack
from datetime import UTC, datetime
from pathlib import Path

import spiceypy as spice


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://pds.nasa.gov/data/vg1-j-spice-6-spk-v2.0/vg_1501/"
DIGESTS = {
    "vg1_jup.spk": "bacbee81efee76be807584a3a0a53cc6bd4213ac33e2c31180a75a02f93f98d0",
    "leapsecs.ker": "eb4ff23ab76bc987c36c200849fe978c8a1bc2ecfb389b751a6c27b639957ecb",
}


def verify_digest(path, expected):
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f"SHA-256 mismatch for {path.name}: {actual}")


def iso_utc(ms):
    return datetime.fromtimestamp(ms / 1000, UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")


def guarded_intervals(boundaries, guard_ms=1):
    if len(boundaries) < 2 or not all(math.isfinite(t) for t in boundaries):
        raise ValueError("Source interval boundaries must be finite")
    intervals = []
    for a, b in zip(boundaries, boundaries[1:]):
        start, end = math.ceil(a + guard_ms), math.floor(b - guard_ms)
        if b <= a or start >= end:
            raise ValueError("Source intervals must increase and contain a guarded interior")
        intervals.append((start, end))
    return intervals


def hermite(p0, p1, v0, v1, seconds, t):
    if seconds <= 0 or not 0 <= t <= 1 or not all(math.isfinite(x) for x in [p0, p1, v0, v1, seconds, t]):
        raise ValueError("Hermite interpolation requires a finite in-range interval")
    return p0 + (3*t*t - 2*t*t*t)*(p1-p0) + seconds*((t*t*t-2*t*t+t)*v0 + (t*t*t-t*t)*v1)


def interpolate_row(a, b, ms):
    if not a[0] <= ms <= b[0] or b[0] <= a[0]:
        raise ValueError("Cannot extrapolate a state interval")
    seconds = (b[0] - a[0]) / 1000
    t = (ms - a[0]) / (b[0] - a[0])
    row = [ms] + [0.0]*12
    for offset in [1, 7]:
        for axis in range(3):
            i = offset + axis
            row[i] = hermite(a[i], b[i], a[i+3], b[i+3], seconds, t)
            row[i+3] = (6*t-6*t*t)*(b[i]-a[i])/seconds + (3*t*t-4*t+1)*a[i+3] + (3*t*t-2*t)*b[i+3]
    return row


def position_errors(a, b):
    return math.dist(a[1:4], b[1:4]), math.dist(a[7:10], b[7:10])


def adaptive_samples(start, end, query, tolerance=0.25):
    cache = {}

    def sample(ms):
        if ms not in cache:
            row = list(query(ms))
            if len(row) != 13 or not all(math.isfinite(x) for x in row) or row[0] != ms:
                raise ValueError("Source states must contain a time and twelve finite components")
            cache[ms] = row
        return cache[ms]

    rows = [sample(start)]

    def append_interval(a, b):
        if len(rows) > 100_000:
            raise ValueError("Adaptive sampling exceeded its point limit")
        checks = [a[0] + (b[0]-a[0])*f for f in [0.25, 0.5, 0.75]]
        error = max(max(position_errors(interpolate_row(a, b, ms), sample(ms))) for ms in checks)
        if b[0]-a[0] <= 21_600_000 and error <= tolerance:
            rows.append(b)
            return
        if b[0]-a[0] < 1000:
            raise ValueError(f"Source discontinuity or unresolved curvature at {iso_utc(a[0])}: {error} km")
        middle = sample(math.floor((a[0]+b[0])/2))
        append_interval(a, middle)
        append_interval(middle, b)

    if not math.isfinite(start) or not math.isfinite(end) or end <= start:
        raise ValueError("Sampling interval must be finite and increasing")
    append_interval(rows[0], sample(end))
    return rows


class KernelSource:
    def __init__(self, root):
        self.root = root
        self.kernels = ExitStack()
        self.descriptors = []
        self.intervals = []
        self.coverage = []

    def __enter__(self):
        try:
            for name, digest in DIGESTS.items():
                verify_digest(self.root / name, digest)
            for name in ["leapsecs.ker", "vg1_jup.spk"]:
                path = str(self.root / name)
                spice.furnsh(path)
                self.kernels.callback(spice.unload, path)
            path = str(self.root / "vg1_jup.spk")
            coverage = spice.spkcov(path, -31)
            if spice.wncard(coverage) != 1:
                raise ValueError("The pinned input must have its one documented spacecraft coverage window")
            first, last = spice.wnfetd(coverage, 0)
            self.coverage = [spice.et2utc(t, "ISOC", 6) + "Z" for t in [first, last]]
            boundaries = {first, last}
            handle = spice.dafopr(path)
            try:
                spice.dafbfs(handle)
                while spice.daffna():
                    dc, ic = spice.dafus(spice.dafgs(), 2, 6)
                    if int(ic[0]) not in [-31, 5, 10, 599]:
                        continue
                    self.descriptors.append({
                        "name": spice.dafgn(), "target": int(ic[0]), "center": int(ic[1]),
                        "frame": spice.frmnam(int(ic[2])), "type": int(ic[3]),
                        "startEt": float(dc[0]), "endEt": float(dc[1]),
                    })
                    boundaries.update(float(t) for t in dc if first < t < last)
            finally:
                spice.dafcls(handle)
            utc_ms = [
                datetime.fromisoformat(spice.et2utc(t, "ISOC", 6)).replace(tzinfo=UTC).timestamp()*1000
                for t in sorted(boundaries)
            ]
            self.intervals = guarded_intervals(utc_ms)
            return self
        except BaseException:
            self.kernels.close()
            raise

    def __exit__(self, *args):
        return self.kernels.__exit__(*args)

    def sample(self, ms):
        et = spice.str2et(iso_utc(ms))
        # SPICE velocities are ET derivatives; the packaged independent axis is UTC.
        utc_rate = (spice.str2et(iso_utc(ms+10_000)) - spice.str2et(iso_utc(ms-10_000))) / 20
        row = [ms]
        for target in ["-31", "599"]:
            state, _ = spice.spkezr(target, et, "ECLIPJ2000", "NONE", "SUN")
            row.extend(float(x) for x in state[:3])
            row.extend(float(x)*utc_rate for x in state[3:])
        return row

    def segment_name(self, ms):
        et = spice.str2et(iso_utc(ms))
        candidates = [d["name"] for d in self.descriptors if d["target"] == -31 and d["startEt"] <= et <= d["endEt"]]
        if not candidates:
            raise ValueError("No source descriptor for the published interval")
        return candidates[-1]


def validate(data, source):
    maxima = {"spacecraftKm": 0.0, "jupiterKm": 0.0}
    worst = {}
    reference_rows = []
    count = 0
    nearest = {"distanceKm": math.inf, "utcMs": None}
    for segment in data["segments"]:
        rows = segment["samples"]
        times = [r[0] for r in rows]
        probes = set(range(segment["startUtcMs"], segment["endUtcMs"], 60_000))
        probes.update([segment["startUtcMs"], segment["endUtcMs"]])
        withheld = []
        for a, b in zip(rows, rows[1:]):
            for f in [0.13, 0.37, 0.61, 0.89]:
                ms = a[0] + (b[0]-a[0])*f
                probes.add(ms)
                if f == 0.37:
                    withheld.append(ms)
        for ms in sorted(probes):
            index = min(len(rows)-2, max(0, bisect.bisect_right(times, ms)-1))
            actual = source.sample(ms)
            errors = position_errors(interpolate_row(rows[index], rows[index+1], ms), actual)
            for key, error in zip(maxima, errors):
                if error > maxima[key]:
                    maxima[key], worst[key] = error, iso_utc(ms) + "Z"
            distance = math.dist(actual[1:4], actual[7:10])
            if distance < nearest["distanceKm"]:
                nearest = {"distanceKm": distance, "utcMs": ms}
            count += 1
        stride = max(1, len(withheld)//40)
        reference_rows.extend(source.sample(ms) for ms in withheld[::stride])
    if max(maxima.values()) > 1:
        raise ValueError(f"Independent source-reproduction gate failed: {maxima}, worst UTC {worst}")
    return {
        "maximumPositionError": maxima, "worstUtc": worst, "checkedTimes": count,
        "gridStepSeconds": 60, "independentFractions": [0.13, 0.37, 0.61, 0.89],
        "minimumCheckedJupiterDistance": nearest,
        "scope": "Measured reproduction of this source at checked times, not absolute ephemeris accuracy.",
    }, {"samples": reference_rows}


def generate(root):
    with KernelSource(root) as source:
        segments = []
        for start, end in source.intervals:
            print(f"Sampling {iso_utc(start)} to {iso_utc(end)}", flush=True)
            rows = adaptive_samples(start, end, source.sample)
            rounded = [
                [r[0]] + [round(x, 6 if i % 6 < 3 else 10) for i, x in enumerate(r[1:])]
                for r in rows
            ]
            segments.append({
                "source": source.segment_name((start+end)/2),
                "startUtcMs": start, "endUtcMs": end, "samples": rounded,
            })
        data = {
            "schemaVersion": 1, "id": "voyager-1-jupiter-1979", "spacecraftId": "voyager-1",
            "center": "SUN", "frame": "ECLIPJ2000", "timeScale": "UTC",
            "positionUnit": "km", "velocityUnit": "km/s", "segments": segments,
        }
        encoded = (json.dumps(data, separators=(",", ":"), allow_nan=False) + "\n").encode()
        report, reference = validate(json.loads(encoded), source)
        manifest = {
            "id": data["id"], "spacecraftId": data["spacecraftId"], "referenceBodyId": "jupiter",
            "url": "/trajectories/voyager-1-jupiter-1979.json",
            "sha256": hashlib.sha256(encoded).hexdigest(), "bytes": len(encoded),
            "coverage": [[s["startUtcMs"], s["endUtcMs"]] for s in segments],
            "presetUtc": "1979-03-05T12:00:00Z",
            "classification": "historical-navigation", "datasetId": "VG1-J-SPICE-6-SPK-V2.0",
            "sourceUrl": SOURCE_URL + "geometry/pc/vg1_jup.spk",
            "catalogUrl": SOURCE_URL + "catalog/spkds.cat",
            "recordUrl": "https://data.nasa.gov/dataset/vg1-jupiter-spice-spk-kernel-v2-0",
            "sourceHashes": DIGESTS, "sourceReleaseDate": "1998-05-01", "acquiredAt": "2026-10-15",
            "sourceCoverageUtc": source.coverage,
            "boundaryGuard": "Trim each source interval inward by 1 ms, then round inward to UTC milliseconds; these are import guard gaps, not missing original data.",
            "sourceCaveat": "Interim historical navigation archive. Reconstruction/prediction is not identified per segment; absolute orbit accuracy is not supplied.",
            "reuse": "Numerical state-query output only. Source catalog supplies data for trajectory generation and coordinate transformations. NASA Open Data says License not specified. Original kernels and archive prose are not shipped.",
            "timeConversion": "Paired LSK via CSPICE str2et/et2utc; geometric ECLIPJ2000 relative to SUN; ET velocity derivatives converted to UTC seconds using a symmetric 20-second time derivative. No leap-second event lies in this published interval.",
            "tools": {"spiceypy": spice.__version__, "cspice": spice.tkvrsn("TOOLKIT")},
            "validation": report, "sampleCount": sum(len(s["samples"]) for s in segments),
        }
        report = {**report, "sourceDescriptors": source.descriptors, "manifest": manifest}
    output = ROOT / "public/trajectories/voyager-1-jupiter-1979.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(encoded)
    for path, payload in [
        (ROOT / "src/spacecraft/voyager1-manifest.json", manifest),
        (ROOT / "src/spacecraft/voyager1-reference.json", reference),
        (root / "validation.json", report),
    ]:
        path.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
    print(json.dumps({
        "bytes": len(encoded), "sampleCount": manifest["sampleCount"],
        "intervals": manifest["coverage"], "validation": manifest["validation"],
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / ".artifacts/spacecraft-sources/voyager1-jupiter")
    generate(parser.parse_args().source_dir)
