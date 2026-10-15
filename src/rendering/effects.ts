import {
  AdditiveBlending, BackSide, Color, MeshStandardMaterial, ShaderMaterial, Vector3,
} from 'three';

export function earthMaterial() {
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.06,
    emissive: new Color(0xffdfba), emissiveIntensity: 0.75 });
  const sunDirection = { value: new Vector3(1, 0, 0) };
  material.onBeforeCompile = shader => {
    shader.uniforms.solarLightView = sunDirection;
    shader.fragmentShader = `uniform vec3 solarLightView;\n${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - smoothstep(-0.12, 0.16, dot(normal, solarLightView));',
    );
  };
  material.customProgramCacheKey = () => 'earth-night-terminator-v1';
  return { material, sunDirection };
}

export function atmosphereMaterial() {
  return new ShaderMaterial({
    uniforms: { sunDirection: { value: new Vector3(1, 0, 0) } },
    transparent: true, side: BackSide, blending: AdditiveBlending, depthWrite: false,
    vertexShader: `
      varying vec3 atmosphereNormal;
      varying vec3 atmosphereView;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        atmosphereNormal = normalize(normalMatrix * normal);
        atmosphereView = -viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      uniform vec3 sunDirection;
      varying vec3 atmosphereNormal;
      varying vec3 atmosphereView;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 normal = normalize(atmosphereNormal);
        float rim = pow(1.0 - abs(dot(normal, normalize(atmosphereView))), 3.3);
        float daylight = smoothstep(-0.28, 0.65, dot(normal, sunDirection));
        gl_FragColor = vec4(mix(vec3(0.07, 0.19, 0.5), vec3(0.2, 0.5, 1.0), daylight), rim * (0.12 + 0.65 * daylight));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function haloMaterial() {
  return new ShaderMaterial({
    transparent: true, blending: AdditiveBlending, depthWrite: false,
    vertexShader: `
      varying vec2 haloUv;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        haloUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      varying vec2 haloUv;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float radius = length(haloUv - 0.5) * 2.0;
        float glow = exp(-radius * radius * 7.5) * (1.0 - smoothstep(0.55, 1.0, radius));
        gl_FragColor = vec4(1.0, 0.52, 0.18, glow * 0.24);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
