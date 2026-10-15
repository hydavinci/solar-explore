import {
  AmbientLight, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Material, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PointLight,
  Points, PointsMaterial, Quaternion, RingGeometry, Scene, SphereGeometry, Vector3, type Texture,
} from 'three';
import { BODY_IDS, type BodyId, type Catalog } from '../simulation/types';
import { toSceneDirection } from '../simulation/coordinates';
import { relativeDisplayPosition } from './display-mapping';
import { getDisplayCamera, navigationAnchor, type FrameSnapshot } from './runtime';
import type { Quality } from './quality';
import { lightDirection, radialRingUv, seededStars } from './scene-math';
import { atmosphereMaterial, earthMaterial, haloMaterial } from './effects';
import type { TextureId } from '../assets/manifest';
import { SATURN_RING_OUTER_RADIUS } from '../navigation/framing';

const fallback: Record<BodyId, number> = {
  sun: 0xffc979, mercury: 0x918c88, venus: 0xb5a781, earth: 0x245078, moon: 0x9b9893,
  mars: 0x9d593d, jupiter: 0xb5a089, saturn: 0xb9a67c, uranus: 0x8cbdc5, neptune: 0x3760b1,
};
export function createSolarScene(catalog: Catalog, quality: Quality) {
  const scene = new Scene(), background = new Scene();
  background.background = new Color(0x02040a);
  const backgroundCamera = new PerspectiveCamera(60, 1, 0.1, 100);
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute('position', new BufferAttribute(seededStars(quality === 'standard' ? 2600 : 1200), 3));
  background.add(new Points(starGeometry, new PointsMaterial({
    color: 0xb2c3de, size: 1, sizeAttenuation: false, transparent: true, opacity: 0.6, depthWrite: false,
  })));
  const sphere = new SphereGeometry(1, quality === 'standard' ? 64 : 32, quality === 'standard' ? 40 : 24);
  const sun = new PointLight(0xfff5e7, 3.4, 0, 0);
  scene.add(sun, new AmbientLight(0x8394b5, 0.018));
  const earth = earthMaterial(), atmosphere = atmosphereMaterial();
  earth.material.color.set(fallback.earth);
  earth.material.emissiveIntensity = 0;
  const bodies = new Map<BodyId, { root: Group; surface: Mesh<SphereGeometry, MeshStandardMaterial | MeshBasicMaterial>; pole: Quaternion }>();
  const pickable: Mesh[] = [];
  for (const id of BODY_IDS) {
    const root = new Group();
    const material = id === 'sun' ? new MeshBasicMaterial({ color: fallback.sun, toneMapped: false })
      : id === 'earth' ? earth.material : new MeshStandardMaterial({ color: fallback[id], roughness: 0.92 });
    const surface = new Mesh(sphere, material);
    surface.userData.bodyId = id;
    const pole = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0),
      new Vector3(...toSceneDirection(catalog[id].northPole ?? [0, 0, 1])).normalize());
    root.add(surface); scene.add(root); pickable.push(surface);
    bodies.set(id, { root, surface, pole });
  }
  const cloudMaterial = new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.83,
    roughness: 1, depthWrite: false, alphaTest: 0.04 });
  const clouds = new Mesh(sphere, cloudMaterial);
  clouds.scale.setScalar(1.008); clouds.visible = false;
  bodies.get('earth')!.root.add(clouds);
  const air = new Mesh(sphere, atmosphere);
  air.scale.setScalar(1.025); air.renderOrder = 3;
  bodies.get('earth')!.root.add(air);
  const ringGeometry = new RingGeometry(1.24, SATURN_RING_OUTER_RADIUS, quality === 'standard' ? 160 : 96);
  const ringPositions = ringGeometry.getAttribute('position'), ringUvs = ringGeometry.getAttribute('uv');
  for (let i = 0; i < ringPositions.count; i++) ringUvs.setXY(i, ...radialRingUv(ringPositions.getX(i), ringPositions.getY(i), 1.24, SATURN_RING_OUTER_RADIUS));
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new MeshStandardMaterial({ color: 0xc7b48e, roughness: 1, side: DoubleSide,
    transparent: true, alphaTest: 0.08, depthWrite: true });
  const rings = new Mesh(ringGeometry, ringMaterial);
  rings.userData.bodyId = 'saturn';
  rings.quaternion.copy(bodies.get('saturn')!.pole);
  bodies.get('saturn')!.root.add(rings); pickable.push(rings);
  const halo = new Mesh(new PlaneGeometry(1, 1), haloMaterial());
  halo.scale.setScalar(5.2);
  bodies.get('sun')!.root.add(halo);
  const spin = new Quaternion(), axis = new Vector3(0, 1, 0);
  let disposed = false;
  const setMap = (material: MeshStandardMaterial | MeshBasicMaterial, texture: Texture | null, color: number) => {
    if (material.map === texture) return;
    material.map = texture; material.color.set(texture ? 0xffffff : color); material.needsUpdate = true;
  };
  return {
    scene, background, backgroundCamera, bodies, pickable,
    setTextures(get: (id: TextureId) => Texture | null) {
      for (const [id, body] of bodies) setMap(body.surface.material, get(id), fallback[id]);
      const night = get('earthNight');
      if (earth.material.emissiveMap !== night) { earth.material.emissiveMap = night; earth.material.needsUpdate = true; }
      // Without a night map, standard emissive would otherwise illuminate the entire night hemisphere.
      earth.material.emissiveIntensity = night ? 0.75 : 0;
      const cloud = get('earthClouds');
      clouds.visible = quality === 'standard' && Boolean(cloud);
      if (cloudMaterial.alphaMap !== cloud) {
        cloudMaterial.alphaMap = cloud; cloudMaterial.needsUpdate = true;
      }
      setMap(ringMaterial, get('saturnRing'), 0xc7b48e);
    },
    update(frame: FrameSnapshot, camera: PerspectiveCamera) {
      const pose = getDisplayCamera(frame, catalog);
      camera.position.set(0, 0, 0);
      camera.up.set(...pose.up); camera.lookAt(...pose.forward);
      let far = 1000, nearestSurface = Infinity;
      for (const [id, body] of bodies) {
        body.root.position.set(...relativeDisplayPosition(id, frame.world, catalog, frame.scaleMode, frame.navigation.positionKm, navigationAnchor(frame)));
        const radius = frame.displayWorld[id].radius;
        body.root.scale.setScalar(radius);
        body.surface.quaternion.copy(body.pole).multiply(spin.setFromAxisAngle(axis, frame.world.bodies[id].spinRad));
        const distance = body.root.position.length();
        far = Math.max(far, distance + radius * 6);
        nearestSurface = Math.min(nearestSurface, distance - radius * (id === 'saturn' ? SATURN_RING_OUTER_RADIUS : 1.025));
      }
      camera.near = Math.max(0.00001, Math.min(0.1, Math.max(0.001, nearestSurface) * 0.01));
      camera.far = far * 1.05;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      sun.position.copy(bodies.get('sun')!.root.position);
      const sunDirection = new Vector3(...lightDirection(frame.world.bodies.earth.positionKm, frame.world.bodies.sun.positionKm))
        .transformDirection(camera.matrixWorldInverse);
      earth.sunDirection.value.copy(sunDirection);
      atmosphere.uniforms.sunDirection!.value.copy(sunDirection);
      const cloudSpin = frame.world.bodies.earth.spinRad + ((frame.clock.julianDay - 2451545) % 15) * 2 * Math.PI / 15;
      clouds.quaternion.copy(bodies.get('earth')!.pole).multiply(spin.setFromAxisAngle(axis, cloudSpin));
      halo.quaternion.copy(camera.quaternion);
      backgroundCamera.quaternion.copy(camera.quaternion);
      backgroundCamera.aspect = camera.aspect; backgroundCamera.fov = camera.fov;
      backgroundCamera.updateProjectionMatrix(); backgroundCamera.updateMatrixWorld();
      scene.updateMatrixWorld();
    },
    restore() {
      for (const root of [scene, background]) root.traverse(object => {
        const mesh = object as Mesh;
        if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.needsUpdate = true;
        if (mesh.geometry) {
          for (const attribute of Object.values(mesh.geometry.attributes)) attribute.needsUpdate = true;
          if (mesh.geometry.index) mesh.geometry.index.needsUpdate = true;
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const resources = new Set<BufferGeometry | Material>();
      for (const root of [scene, background]) root.traverse(object => {
        const mesh = object as Mesh;
        if (mesh.geometry) resources.add(mesh.geometry);
        if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(m);
      });
      for (const resource of resources) resource.dispose();
      scene.clear(); background.clear(); bodies.clear();
    },
  };
}
