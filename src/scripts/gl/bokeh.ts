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
 * Боке гирлянд (DESIGN-SYSTEM §7.4): едва заметное.
 * Только мелкие огоньки диаметром 6-28px, гауссово затухание без видимого края, непрозрачность 0.04-0.12.
 * Количество: в hero и финальном CTA до 25 штук, в остальных секциях не больше 8 и только по краям экрана,
 * под текстом никогда (поэтому все огоньки живут в боковых полосах). Тёплых ~30%. Параллакс 0.3x.
 * Инстансы-квады, а не Points: на мобильных max point size бывает 64px.
 */

const ALWAYS = 8; // столько огоньков горит в любых секциях; остальные только в hero и финальном CTA

const vertex = /* glsl */ `
  attribute vec3 aOffset;   // x, y: база 0..1; z: фаза
  attribute vec4 aStyle;    // x: радиус в css px; y: альфа; z: тёплый (0|1); w: скорость дрейфа
  attribute float aScene;   // 0: горит всегда; 1: только в hero и финальном CTA
  uniform float uTime;
  uniform float uScroll;    // scrollY / высота экрана * 0.3
  uniform vec2 uViewport;   // css px
  uniform float uScale;     // масштаб радиусов от ширины экрана
  uniform float uBoost;     // 0..1: вес «сценических» огоньков (hero, финальный CTA)
  varying vec2 vUv;
  varying float vAlpha;
  varying float vWarm;

  void main() {
    vUv = uv;
    vWarm = aStyle.z;
    float drift = aStyle.w;
    float px = aOffset.x + sin(uTime * 0.07 * drift + aOffset.z * 30.0) * 0.012;
    float py = aOffset.y + cos(uTime * 0.05 * drift + aOffset.z * 17.0) * 0.03;
    float y = fract(py - uScroll * 0.8333);          // 2 clip-единицы на экран / 2.4 диапазона
    vec2 c = vec2(px * 2.0 - 1.0, y * 2.4 - 1.2);
    // квад вдвое больше радиуса: хвост гауссианы не обрезается краем
    vec2 r = aStyle.x * uScale * 2.0 * 2.0 / uViewport;
    gl_Position = vec4(c + position.xy * r, 0.0, 1.0);
    float scene = mix(1.0, uBoost, aScene);
    vAlpha = aStyle.y * scene * smoothstep(-1.25, -0.9, c.y) * smoothstep(1.25, 0.9, c.y)
           * (0.8 + 0.2 * sin(uTime * 0.3 + aOffset.z * 50.0));
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
    float r2 = dot(p, p);
    // Гауссово затухание: нет контура круга, только мягкое пятно света
    float g = exp(-r2 * 7.0) * step(r2, 1.0);
    float a = g * vAlpha * uFade;
    vec3 cool = mix(uCool1, uCool2, fract(vAlpha * 53.0));
    vec3 col = mix(cool, uWarm, vWarm);
    gl_FragColor = vec4(col * a, a);
  }
`;

export interface BokehOptions {
  /** Всего огоньков: до 25 в hero и финальном CTA (на mobile меньше). */
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
  const scene = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Только боковые полосы экрана (по 12%): центр, где стоит текст, остаётся чистым
    const left = Math.random() < 0.5;
    offsets[i * 3] = left ? Math.random() * 0.12 : 0.88 + Math.random() * 0.12;
    offsets[i * 3 + 1] = Math.random();
    offsets[i * 3 + 2] = Math.random();
    const warm = Math.random() < 0.3 ? 1 : 0;
    styles[i * 4] = 3 + Math.random() * 11;               // радиус 3-14px => диаметр 6-28px
    styles[i * 4 + 1] = 0.04 + Math.random() * 0.08;      // непрозрачность 0.04-0.12
    styles[i * 4 + 2] = warm;
    styles[i * 4 + 3] = 0.5 + Math.random();
    scene[i] = i < ALWAYS ? 0 : 1;
  }
  geometry.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute('aStyle', new InstancedBufferAttribute(styles, 4));
  geometry.setAttribute('aScene', new InstancedBufferAttribute(scene, 1));
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
      uBoost: { value: 1 },
      uFade: { value: 0 },
      uCool1: { value: new Color('#5dc0e1') },
      uCool2: { value: new Color('#598bfb') },
      uWarm: { value: new Color('#ffd49a') },
    },
  });

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  stage.scene.add(mesh);

  // Сценические огоньки (сверх 8) включаются, только пока в кадре hero или финальный CTA
  let target = 1;
  const visible = new Set<Element>();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
    target = visible.size ? 1 : 0;
  });
  document.querySelectorAll('#hero').forEach((el) => io.observe(el));

  return {
    update({ dt, time, scrollY, fade }: Frame) {
      const u = material.uniforms;
      u.uTime.value = time;
      u.uFade.value = fade;
      u.uScroll.value = (scrollY / Math.max(1, window.innerHeight)) * 0.3;
      u.uBoost.value += (target - u.uBoost.value) * Math.min(1, dt * 3);
    },
    resize(width, height) {
      material.uniforms.uViewport.value.set(width, height);
      material.uniforms.uScale.value = Math.min(1, Math.max(0.75, width / 1280));
    },
    dispose() {
      io.disconnect();
      stage.scene.remove(mesh);
      geometry.dispose();
      quad.dispose();
      material.dispose();
    },
  };
}
