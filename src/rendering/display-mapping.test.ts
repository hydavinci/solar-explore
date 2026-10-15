import { expect, it } from 'vitest';
import { mapWorld, mapPosition, mapCamera, schematicDistance } from './display-mapping';
import { catalog } from '../simulation/catalog';
import { evaluateWorld } from '../simulation/world';
import { length, sub, add } from '../simulation/vector';

it('uses the same scale for all real positions and radii without mutation', () => {
  const world = evaluateWorld(2451545);
  const saved = JSON.stringify(world);
  const display = mapWorld(world, catalog, 'real');
  expect(display.earth.radius).toBe(catalog.earth.radiusKm / 1000);
  expect(length(display.earth.position) / display.earth.radius).toBeCloseTo(length(world.bodies.earth.positionKm) / catalog.earth.radiusKm);
  expect(JSON.stringify(world)).toBe(saved);
});
it('maps schematic distances monotonically and treats Moon relative to Earth', () => {
  expect(schematicDistance(1e9)).toBeGreaterThan(schematicDistance(1e8));
  const world = evaluateWorld(2451545);
  const mapped = mapWorld(world, catalog, 'schematic');
  const moon = mapPosition('moon', world.bodies.moon.positionKm, world, catalog, 'schematic');
  expect(moon).toEqual(mapped.moon.position);
  expect(length(sub(moon, mapped.earth.position))).toBeGreaterThan(4);
  expect(length(sub(moon, mapped.earth.position))).toBeLessThan(5);
  const earthShift = [1e7, 0, 0] as const;
  const shifted = { ...world, bodies: { ...world.bodies,
    earth: { ...world.bodies.earth, positionKm: add(world.bodies.earth.positionKm, earthShift) },
    moon: { ...world.bodies.moon, positionKm: add(world.bodies.moon.positionKm, earthShift) },
  } };
  const second = mapWorld(shifted, catalog, 'schematic');
  expect(length(sub(sub(second.moon.position, second.earth.position), sub(moon, mapped.earth.position)))).toBeLessThan(1e-10);
});
it('maps a physical target-relative camera to the same apparent radius ratio', () => {
  const world = evaluateWorld(2451545);
  const physicalCamera = add(world.bodies.earth.positionKm, [catalog.earth.radiusKm * 4, 0, 0]);
  const display = mapWorld(world, catalog, 'schematic');
  const camera = mapCamera(physicalCamera, 'earth', world, catalog, 'schematic');
  expect(length(sub(camera, display.earth.position)) / display.earth.radius).toBeCloseTo(4);
});
