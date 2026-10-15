# Astronomical model and provenance

Evidence inspected on **2026-10-13**. This is an approximate visual explorer, not a precision ephemeris, navigation instrument, eclipse predictor, or physical spacecraft simulation. The application accepts UTC 1800-01-01 inclusive through 2050-01-01 exclusive.

## Ephemerides and frame

Normal planetary positions use the **already installed `astronomy-engine` 2.1.19**, not a fabricated JPL parameter table. Active Voyager 1 historical replay substitutes only Jupiter's position with its paired SPK data, described below. Package version and MIT license were confirmed against `https://registry.npmjs.org/astronomy-engine/2.1.19` and the installed package. Its complete shipped API reference is `node_modules/astronomy-engine/README.md`; implementation evidence below refers to `node_modules/astronomy-engine/astronomy.js`.

- `HelioVector`, lines 3610–3666: geometric heliocentric vectors, J2000 **equatorial** axes, astronomical units; no light-time or aberration correction.
- `GeoMoon`, around line 2798: geocentric J2000 equatorial vector.
- `Rotation_EQJ_ECL`, lines 6558–6580: fixed J2000 mean equator → J2000 mean ecliptic rotation. Do **not** substitute `Ecliptic`, which produces true ecliptic **of date**.
- Every physical vector uses this fixed rotation and the package AU conversion (`149597870.69098932 km/AU`). The small difference from the modern exact AU is retained for consistency with this model.
- `evaluatePlanet('earth', jd)` deliberately returns `Body.EMB` for the original shared interface. `evaluateWorld` uses the geocentric Moon vector and the library's Earth/Moon mass ratio to split EMB into Earth and Moon; the Moon is never treated as independently heliocentric without adding Earth.
- Library numeric time is **days since J2000**, not a full Julian day. Calls therefore use `jd - 2451545`. The package's `AstroTime` computes its own approximate terrestrial time/Delta-T from UT. UI UTC is treated as UT; this does not model UTC–UT1 Earth-orientation corrections or historical civil-time differences.
- Positions are evaluated from absolute time. Pause, rewind and date jumps do not integrate or accumulate orbital error.

The original design proposed JPL 1800–2050 Kepler tables and a simplified Moon; the approved implementation instead uses the installed Astronomy Engine model (VSOP planetary series and the library lunar model). `solveKepler` remains a tested utility, **not** the source of production planetary positions.

## Physical radii

The bodies are spherical approximations. Values below are not a uniform modern mean-radius dataset; the provenance is deliberately explicit rather than presenting guessed constants as JPL data.

| Body | Radius used | Evidence |
|---|---:|---|
| Sun | 695700 km | installed `astronomy.js`, `SUN_RADIUS_KM`, line ~128 |
| Mercury | 2439.7 km | installed `astronomy.js`, transit `planet_radius_km` switch |
| Venus | 6051.8 km | same transit switch |
| Earth | 6371 km | installed `EARTH_MEAN_RADIUS_KM`, line ~135 |
| Moon | 1737.4 km | installed `MOON_MEAN_RADIUS_KM`, line ~140 |
| Jupiter | 69911 km | installed exported `JUPITER_MEAN_RADIUS_KM`, with IAU/NASA source comments |
| Mars | AU × tan(4.68 arcsec) | published angular semidiameter, source below |
| Saturn | AU × tan(82.73 arcsec) | published equatorial angular semidiameter, source below |
| Uranus | AU × tan(35.02 arcsec) | published angular semidiameter, source below |
| Neptune | AU × tan(33.50 arcsec) | published angular semidiameter, source below |

The final four missing values were obtained from the source map in the MIT-licensed **`@tubular/astronomy` 3.5.6** npm release, published `src/solar-system.ts`, method `getAngularDiameter`, lines ~943–970. It computes angular radius as the listed coefficient divided by distance in AU, then doubles to give diameter. We infer the spherical physical radius from the coefficient at one AU; these are approximate apparent-disc radii, **not claimed to be JPL modern volumetric mean radii**. The package was read in memory for evidence only: it is not installed or a runtime dependency.

Reproducible evidence:

- Package metadata: `https://registry.npmjs.org/@tubular/astronomy/3.5.6`
- Published source-map archive: `https://registry.npmjs.org/@tubular/astronomy/-/astronomy-3.5.6.tgz`
- Source member `../src/solar-system.ts`, `getAngularDiameter`: Mars 4.68, Saturn 82.73 (equatorial) / 73.82 (polar), Uranus 35.02, Neptune 33.50 arcseconds at 1 AU.

JPL physical-parameter page `https://ssd.jpl.nasa.gov/planets/phys_par.html` and npm HTML documentation were attempted with browser/fetch/curl tools but could not be retrieved in this environment (transport failure / timeout). No successful JPL fetch or new JPL numerical reference fixture is claimed.

## Mass and rotation

`MassProduct` returns GM in AU³/day²; its shipped documentation cites JPL DE405/LE405 constants. `massKg` is the approximate display mass obtained by unit conversion and division by G = 6.67430 × 10⁻²⁰ km³ kg⁻¹ s⁻² (conventional CODATA value, not an independent precise mass measurement). Earth/Moon **ratios**, not absolute masses, determine barycenter splitting.

`RotationAxis` (installed source lines ~9114–9290) documents the IAU WGCCRE 2015 report and a 2009 reference for the lunar terms. The catalog derives its J2000 pole, phase, and one-day signed spin rate from that implementation. Rendering uses a **fixed J2000 pole plus constant signed rate**. This is an approximation: long-term precession, periodic libration, differential solar rotation and accurate texture longitude registration are not promised.

`northPole` is the optional unit pole vector in physical J2000 ecliptic coordinates. `axialTiltRad` is its angle from +ecliptic Z, **not necessarily the commonly tabulated orbital-plane obliquity**. `rotationPeriodDays` is signed; Venus and Uranus are negative. Do not combine a flipped retrograde pole with a second sign flip. A renderer should orient its local +Y axis to `toSceneDirection(northPole)`, then apply `spinRad` about local +Y. Texture registration remains artistic.

## Numerical and display limits

- Unit tests verify frame orientation, broad independent Earth/Neptune heliocentric and Moon geocentric distance ranges at four dates, reproducibility, mass conservation, UTC boundaries and signed spin.
- These are **sanity checks, not independent high-precision ephemeris benchmarks**. An independently retrieved JPL vector fixture over the full interval remains a follow-up validation item. No measured astrometric error or fabricated benchmark is supplied.
- Real mode uses 1000 km per scene unit for distances and radii equally. Camera subtraction occurs in JavaScript physical coordinates before scene conversion.
- Schematic mode changes display positions/radii only. Its monotonic logarithmic mapping is not science; Moon positions remain Earth-relative. Orbital samples must use `mapPosition`, not a different mapping.
- Safety uses spherical surfaces at 1.01 radii in the **active display representation**. Real mode checks physical spheres; schematic mode converts every displayed sphere into the active camera anchor's km units for collision checks. This collision-only geometry never replaces physical ephemerides or catalog data. Saturn rings, atmospheres and terrain are not solid obstacles. Explicit date-jump overlap is projected outside the sphere and reported.
- Adaptive camera speeds (0.1–1e9 km/s) are navigation controls, not physics. Flights use verified piecewise-linear routes, with current-world revalidation.
- Each tick updates the clock and ephemerides **before** applying queued input exactly once. Large follow/orbit center translations are swept against current-frame spheres; an obstruction stops tracking and surfaces an issue rather than teleporting through a body. Continuous motion of other planets between widely separated simulated dates is not a moving-sphere collision model.
- Minimum-altitude orbiting follows spherical arcs instead of clipping each chord against its own target. The target radius is maintained analytically; other bodies are swept with conservative arc-deviation inflation. Large input angles are subdivided; flight paths remain piecewise-linear and separately swept.

## Dependency license

Astronomy Engine: **MIT**, Copyright (c) 2019–2023 Don Cross. Its complete license text is preserved in the shipped source header; retain that notice in distributions. `@tubular/astronomy` metadata declares MIT; only four factual angular-size coefficients were used, not its implementation. Texture/resource licensing is maintained separately by the parent application.

## Spacecraft information (Phase A)

Historical information checked on **2026-10-15**, separately from the planetary evidence above. The six records in `src/spacecraft/catalog.ts` are original short Chinese summaries of official material:

| Record | Official sources |
| --- | --- |
| Voyager 1 | `https://science.nasa.gov/mission/voyager/voyager-1/` |
| Voyager 2 | `https://science.nasa.gov/mission/voyager/voyager-2/` |
| Cassini | `https://science.nasa.gov/mission/cassini/about-the-mission/`, `https://science.nasa.gov/mission/cassini/the-journey/timeline/` |
| Juno | `https://science.nasa.gov/mission/juno/`, `https://www.nasa.gov/image-article/this-week-nasa-history-juno-launches-aug-5-2011/` |
| New Horizons | `https://science.nasa.gov/mission/new-horizons/` |
| Tianwen-1 | `https://www.cnsa.gov.cn/n6758824/n6759009/n6760412/c6840460/content.html`, `https://www.cnsa.gov.cn/n6759533/c6809878/content.html` |

The initial CNSA HTTPS requests failed; HTTP entry URLs redirected successfully to those HTTPS articles. Mission dates are historical text, not trajectory samples or coverage intervals. Local-calendar event dates are not treated as precise UTC instants (Juno's orbit entry is deliberately labelled only 2016). We do not infer present operational status from older mission descriptions or from the simulation clock.

Phase A originally shipped all six trajectories as missing. The first Phase B dataset below now supplies Voyager 1's limited historical positions; the other five remain missing. Tianwen-1's preview object is the orbiter, not the rover or the complete launch stack. Pluto is mentioned in New Horizons' history but is not added to the planetary navigation catalog.

## Voyager 1 Jupiter encounter: first historical replay

Acquired and converted on **2026-10-15**. Source: NASA PDS dataset **`VG1-J-SPICE-6-SPK-V2.0`**, released 1998-05-01. Source files are preserved locally in `.artifacts/spacecraft-sources/voyager1-jupiter/`.

| File | SHA-256 |
| --- | --- |
| `vg1_jup.spk`, 1,045,504 bytes | `bacbee81efee76be807584a3a0a53cc6bd4213ac33e2c31180a75a02f93f98d0` |
| `leapsecs.ker` | `eb4ff23ab76bc987c36c200849fe978c8a1bc2ecfb389b751a6c27b639957ecb` |
| Generated numeric JSON, 79,744 bytes | `d5b60e06752696195aa49103f99a992fdc8905a4ae11570c8b864d1b455c8035` |

Primary records:

- Kernel: `https://pds.nasa.gov/data/vg1-j-spice-6-spk-v2.0/vg_1501/geometry/pc/vg1_jup.spk`
- Product label: `https://pds.nasa.gov/data/vg1-j-spice-6-spk-v2.0/vg_1501/geometry/pc/vg1_jup.lbl`
- Catalog: `https://pds.nasa.gov/data/vg1-j-spice-6-spk-v2.0/vg_1501/catalog/spkds.cat`
- Leap-seconds kernel: `https://pds.nasa.gov/data/vg1-j-spice-6-spk-v2.0/vg_1501/geometry/leapsecs.ker`
- NASA Open Data: `https://data.nasa.gov/dataset/vg1-jupiter-spice-spk-kernel-v2-0`
- Reader reference: `https://spiceypy.readthedocs.io/en/stable/spk.html`

The archived spacecraft segments use NAIF target **-31**, center **5** (Jupiter-system barycenter), frame **DE-108**, SPK type 1. CSPICE resolves the entire center chain and frame rotation; `spkezr(..., 'ECLIPJ2000', 'NONE', 'SUN')` produces geometric heliocentric positions and velocities, without light-time/aberration corrections. Jupiter queries use **599**, not barycenter 5.

The original `spkcov` window decodes to UTC `1979-02-05T23:59:59.999086Z` through `1979-04-08T23:59:59.998349Z`. Published intervals are trimmed inward by at least 1 ms at every relevant source boundary and rounded inward to whole UTC milliseconds:

| Start UTC | End UTC |
| --- | --- |
| 1979-02-06 00:00:00.001 | 1979-02-12 23:59:59.997 |
| 1979-02-13 00:00:00.000 | 1979-02-18 23:59:59.997 |
| 1979-02-19 00:00:00.000 | 1979-03-02 23:59:59.997 |
| 1979-03-03 00:00:00.000 | 1979-03-06 06:06:59.257 |
| 1979-03-06 06:06:59.260 | 1979-04-03 06:04:24.469 |
| 1979-04-03 06:04:24.472 | 1979-04-08 23:59:59.997 |

These millisecond guard gaps are **import trimming**, not a claim of missing original observations. Lines and queries do not bridge them. A forward or reverse playback step that crosses a source boundary exits replay even if its final timestamp would land in another valid interval.

### Time conversion and measured numerical error

The importer uses **SpiceyPy 8.3.0 / CSPICE N0067** and the acquired LSK for UTC/ET conversion. The LSK is historical and only used for this 1979 interval, which contains no leap-second event. ET derivatives are converted to UTC-second derivatives using a symmetric 20-second UTC-to-ET difference. Packaged row times are UTC Unix milliseconds; positions are km and velocities km/s. ET/TDB values are not relabelled as UTC Julian days.

The 396 paired spacecraft/Jupiter knots use piecewise cubic Hermite interpolation. Sampling candidates are limited to six hours and adaptively subdivided until quarter/midpoint/three-quarter source comparisons are below 0.25 km. Rounded and JSON-roundtripped data are then independently checked at a one-minute grid and non-dyadic fractions: **90,847 checked times**.

| Object | Maximum measured position error | Worst checked UTC |
| --- | ---: | --- |
| Voyager 1 | 0.236873989 km | 1979-03-04 23:00:00.000 |
| Jupiter | 0.019637874 km | 1979-03-31 07:11:59.260 |

These are reproduction errors against this particular kernel at checked times, **not absolute orbit-determination errors or a mathematical all-times bound**. The independently queried JS test fixture is `src/spacecraft/voyager1-reference.json`; the full conversion report is `.artifacts/spacecraft-sources/voyager1-jupiter/validation.json`. The bundled descriptor `src/spacecraft/voyager1-manifest.json` records source hashes, coverage, tools and error measurements.

Rendering adaptively tessellates the validated interpolation rather than joining only the sparse knots, and inserts the exact current queried point into the visible curve. It never changes spacecraft coordinates to improve framing or collision outcomes.

### Consistency with the existing scene

At three checked UTC times (1979-02-06 00:01, 1979-03-05 12:05, 1979-04-08 23:59), archived Jupiter positions differ from the current Astronomy Engine output by approximately 24,923 / 25,788 / 26,740 km. These are only three comparisons, not an interval-wide bound or proof of which source is more accurate.

The approved replay therefore uses the **same archived Jupiter position** as the spacecraft source. Only an explicit valid replay context applies the override; completing an asynchronous load cannot switch the source, date, selection or camera. Jupiter retains the application's radius, rotation and texture. Its old approximate orbital guide is hidden during replay. Other bodies and the original catalog remain unchanged.

Real rendering subtracts the physical camera in doubles before unit conversion. Schematic rendering maps craft points and historical path points with the same Jupiter-local affine transformation and camera anchor. The marker is screen-sized, not a physical collision sphere; camera observation limits are not spacecraft dimensions.

### Archival status and reuse record

This is an early **historical navigation archive**, not current telemetry. The catalog describes an interim/convenience SPK merge from Voyager NAV products for SEDR, with additional satellite ephemerides. Neither its `FINAL` product label nor its later processing dates establish a per-interval reconstructed/predicted classification. The application does not claim all epochs are post-event reconstruction, nor assign an unsupported absolute accuracy.

The source catalog explicitly provides these data for trajectory generation and coordinate transformations. The NASA Open Data record says **`License not specified`** (preserved in the local `nasa-opendata.html`). The application distributes only numerical query output and original short explanations, not original SPK/LSK binaries or copied archive prose; it does not label the source CC0/MIT or assert unrestricted redistribution rights for the original archive. No institutional endorsement is implied.

### Reproducing the numerical asset

Normal `npm` development/build needs no Python and no network ephemeris service. To regenerate, retain/download the exact kernels at the paths above; the importer verifies their hashes before reading.

```bash
python3 -m venv .artifacts/spacecraft-sources/spice-env
.artifacts/spacecraft-sources/spice-env/bin/python -m pip install -r scripts/requirements-trajectories.txt
.artifacts/spacecraft-sources/spice-env/bin/python -m unittest discover -s scripts -p 'test_import_voyager1.py'
.artifacts/spacecraft-sources/spice-env/bin/python scripts/import_voyager1.py
npm test -- src/spacecraft/trajectory.test.ts
```

The importer writes the frontend files only after the source-reproduction gate passes. The browser uses the configured deployment `BASE_URL`, verifies the packaged JSON's SHA-256 and schema, and exposes load failure/retry without disabling the main solar-system scene.
