import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import type { Frame, Stage, StageLayer } from './stage';

/**
 * Снег в 3 глубинах (DESIGN-SYSTEM §7.3):
 *  0 дальний: мелкий, медленный, тусклый;
 *  1 средний: резкий, основной;
 *  2 ближний: крупный, не в фокусе (мягкий край), быстрый.
 * Позиции считаются в вершинном шейдере в clip-space; на CPU только аккумуляторы падения и ветра.
 * Слой лежит под контентом (z-gl: 0), текст его перекрывает.
 */

const vertex = /* glsl */ `
  attribute vec4 aSeed;   // x, y: старт 0..1; z: глубина 0|1|2; w: фаза
  uniform float uTime;
  uniform float uFall;    // накопленное падение (ускоряется скроллом)
  uniform float uDrift;   // накопленный ветер
  uniform float uPx;
  uniform float uAspect;
  uniform vec3 uPointer;  // x, y, активность
  varying float vDepth;
  varying float vAlpha;

  void main() {
    float depth = aSeed.z;
    vDepth = depth;
    float k = depth * 0.5;                          // 0, .5, 1
    float speed = mix(0.05, 0.2, k) * (0.8 + 0.4 * fract(aSeed.w * 7.31));
    float sway = sin(uTime * (0.35 + 0.5 * fract(aSeed.w * 3.7)) + aSeed.w * 40.0) * mix(0.015, 0.06, k);

    float y = 1.15 - fract(aSeed.y + uFall * speed * 0.5) * 2.3;
    float x = fract(aSeed.x + uDrift * (0.4 + k) * 0.5 + sway * 0.5) * 2.3 - 1.15;

    // отталкивание курсором (только средний и ближний)
    vec2 d = (vec2(x, y) - uPointer.xy) * vec2(uAspect, 1.0);
    float len = length(d);
    float push = smoothstep(0.32, 0.0, len) * uPointer.z * k * 0.16;
    vec2 dir = len > 0.0001 ? d / len : vec2(0.0);
    x += dir.x * push / uAspect;
    y += dir.y * push;

    gl_Position = vec4(x, y, 0.0, 1.0);

    float size = depth < 0.5 ? 3.2 : (depth < 1.5 ? 5.8 : 15.0);
    gl_PointSize = size * uPx * (0.75 + 0.5 * fract(aSeed.w * 13.1));
    vAlpha = depth < 0.5 ? 0.55 : (depth < 1.5 ? 0.9 : 0.38);
  }
`;

const fragment = /* glsl */ `
  precision mediump float;
  uniform float uFade;
  varying float vDepth;
  varying float vAlpha;

  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float soft = vDepth > 1.5 ? 0.05 : (vDepth > 0.5 ? 0.55 : 0.4);
    float a = smoothstep(1.0, soft, r) * vAlpha * uFade;
    if (a < 0.01) discard;
    vec3 col = mix(vec3(0.72, 0.84, 1.0), vec3(1.0), vDepth * 0.5);
    gl_FragColor = vec4(col * a, a);
  }
`;

export interface SnowOptions {
  count: number;
}

export function createSnow(stage: Stage, { count }: SnowOptions): StageLayer {
  // 50% дальних, 35% средних, 15% ближних
  const far = Math.round(count * 0.5);
  const mid = Math.round(count * 0.35);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = Math.random();
    seeds[i * 4 + 1] = Math.random();
    seeds[i * 4 + 2] = i < far ? 0 : i < far + mid ? 1 : 2;
    seeds[i * 4 + 3] = Math.random();
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 4));

  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
    uniforms: {
      uTime: { value: 0 },
      uFall: { value: 0 },
      uDrift: { value: 0 },
      uPx: { value: 1 },
      uAspect: { value: 1 },
      uFade: { value: 0 },
      uPointer: { value: new Vector3(0, 0, 0) },
    },
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  stage.scene.add(points);

  let pointerGain = 0;

  return {
    update({ dt, time, scrollVelocity, pointer, fade }: Frame) {
      const u = material.uniforms;
      // Скролл ускоряет падение (не более чем в 3 раза) и даёт мягкий ветер
      const boost = Math.min(2, Math.abs(scrollVelocity) * 0.8);
      u.uFall.value += dt * (1 + boost);
      u.uDrift.value += dt * (0.015 + Math.max(-1, Math.min(1, scrollVelocity)) * 0.04);
      u.uTime.value = time;
      u.uFade.value = fade;
      pointerGain += ((pointer.active ? 1 : 0) - pointerGain) * Math.min(1, dt * 5);
      u.uPointer.value.set(pointer.x, pointer.y, pointerGain);
    },
    resize(width, height, pixelRatio) {
      material.uniforms.uPx.value = pixelRatio;
      material.uniforms.uAspect.value = width / height;
    },
    dispose() {
      stage.scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}
