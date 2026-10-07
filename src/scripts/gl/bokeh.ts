import {
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from 'three';
import type { Frame, Stage, StageLayer } from './stage';

/**
 * Боке гирлянд (DESIGN-SYSTEM §7.4): большие мягкие диски на дальнем плане.
 * Холодные (бирюза, синий) преобладают, тёплые янтарные редки и мелкие, с горячей сердцевиной,
 * как лампочки гирлянды (палитра 60/30/7/3). Параллакс при скролле 0.3x.
 * Инстансы-квады, а не Points: на мобильных max point size бывает 64px.
 */

const vertex = /* glsl */ `
  attribute vec3 aOffset;   // x, y: база 0..1; z: фаза
  attribute vec4 aStyle;    // x: радиус в css px; y: альфа; z: тёплый (0|1); w: скорость дрейфа
  uniform float uTime;
  uniform float uScroll;    // scrollY / высота экрана * 0.3
  uniform vec2 uViewport;   // css px
  uniform float uScale;     // масштаб радиусов от ширины экрана: на mobile диски меньше
  varying vec2 vUv;
  varying float vAlpha;
  varying float vWarm;

  void main() {
    vUv = uv;
    vWarm = aStyle.z;
    float drift = aStyle.w;
    float px = aOffset.x + sin(uTime * 0.07 * drift + aOffset.z * 30.0) * 0.03;
    float py = aOffset.y + cos(uTime * 0.05 * drift + aOffset.z * 17.0) * 0.03;
    float y = fract(py - uScroll * 0.8333);          // uScroll в экранах; 2 clip-единицы на экран / 2.4 диапазона
    vec2 c = vec2(px * 2.0 - 1.0, y * 2.4 - 1.2);
    vec2 r = aStyle.x * uScale * 2.0 / uViewport;     // радиус в clip-space
    gl_Position = vec4(c + position.xy * r, 0.0, 1.0);
    vAlpha = aStyle.y * smoothstep(-1.25, -0.9, c.y) * smoothstep(1.25, 0.9, c.y)
           * (0.85 + 0.15 * sin(uTime * 0.3 + aOffset.z * 50.0));
  }
`;

const fragment = /* glsl */ `
  precision mediump float;
  uniform vec3 uCool1;
  uniform vec3 uCool2;
  uniform vec3 uWarm;
  uniform float uFade;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vWarm;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float disc = smoothstep(1.0, 0.8, r);
    float rim = smoothstep(0.55, 0.95, r) * disc;
    // тёплые: горячая сердцевина, как лампочка гирлянды; холодные: линзовое кольцо
    float core = vWarm * smoothstep(0.55, 0.0, r);
    float a = disc * (0.62 + 0.28 * rim * (1.0 - vWarm) + 0.9 * core) * vAlpha * uFade;
    a = min(a, 1.0);
    vec3 cool = mix(uCool1, uCool2, fract(vAlpha * 37.0));
    vec3 col = mix(cool, mix(uWarm, vec3(1.0, 0.93, 0.8), core), vWarm);
    gl_FragColor = vec4(col * a, a);
  }
`;

export interface BokehOptions {
  count: number;
}

export function createBokeh(stage: Stage, { count }: BokehOptions): StageLayer {
  const geometry = new InstancedBufferGeometry();
  const quad = new PlaneGeometry(1, 1);
  // PlaneGeometry в [-0.5, 0.5]; шейдер ждёт [-1, 1]
  const pos = quad.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setXY(i, pos.getX(i) * 2, pos.getY(i) * 2);
  geometry.setIndex(quad.getIndex());
  geometry.setAttribute('position', pos);
  geometry.setAttribute('uv', quad.getAttribute('uv'));

  const offsets = new Float32Array(count * 3);
  const styles = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const warm = Math.random() < 0.14 ? 1 : 0; // тёплые редки
    offsets[i * 3] = Math.random();
    // тёплые огни гирлянд чаще в верхней части
    offsets[i * 3 + 1] = warm ? 0.55 + Math.random() * 0.45 : Math.random();
    offsets[i * 3 + 2] = Math.random();
    const big = Math.random();
    styles[i * 4] = warm ? 14 + big * 30 : 26 + big * big * 120; // радиус css px; тёплые мелкие
    styles[i * 4 + 1] = (warm ? 0.4 : 0.19) * (0.6 + Math.random() * 0.6);
    styles[i * 4 + 2] = warm;
    styles[i * 4 + 3] = 0.5 + Math.random();
  }
  geometry.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute('aStyle', new InstancedBufferAttribute(styles, 4));
  geometry.instanceCount = count;

  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uViewport: { value: new Vector2(1, 1) },
      uScale: { value: 1 },
      uFade: { value: 0 },
      uCool1: { value: new Color('#5dc0e1') },
      uCool2: { value: new Color('#1f5bff') },
      uWarm: { value: new Color('#ffd49a') },
    },
  });

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  stage.scene.add(mesh);

  return {
    update({ time, scrollY, fade }: Frame) {
      const u = material.uniforms;
      u.uTime.value = time;
      u.uFade.value = fade;
      u.uScroll.value = (scrollY / Math.max(1, window.innerHeight)) * 0.3;
    },
    resize(width, height) {
      material.uniforms.uViewport.value.set(width, height);
      material.uniforms.uScale.value = Math.min(1, Math.max(0.4, width / 1280));
    },
    dispose() {
      stage.scene.remove(mesh);
      geometry.dispose();
      quad.dispose();
      material.dispose();
    },
  };
}
