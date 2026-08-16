import { useEffect, useRef, type CSSProperties } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import './GradientBlinds.css'

export interface GradientBlindsProps {
  className?: string
  dpr?: number
  paused?: boolean
  gradientColors?: string[]
  angle?: number
  noise?: number
  blindCount?: number
  blindMinWidth?: number
  mouseDampening?: number
  mirrorGradient?: boolean
  spotlightRadius?: number
  spotlightSoftness?: number
  spotlightOpacity?: number
  distortAmount?: number
  shineDirection?: 'left' | 'right'
  mixBlendMode?: CSSProperties['mixBlendMode']
}

const MAX_COLORS = 8

const hexToRGB = (hex: string): [number, number, number] => {
  const color = hex.replace('#', '').padEnd(6, '0')
  return [
    parseInt(color.slice(0, 2), 16) / 255,
    parseInt(color.slice(2, 4), 16) / 255,
    parseInt(color.slice(4, 6), 16) / 255,
  ]
}

const prepStops = (stops?: string[]) => {
  const base = (stops?.length ? stops : ['#FF9FFC', '#5227FF']).slice(0, MAX_COLORS)
  if (base.length === 1) base.push(base[0])
  const count = Math.max(2, Math.min(MAX_COLORS, base.length))
  while (base.length < MAX_COLORS) base.push(base[base.length - 1])
  return { arr: base.map(hexToRGB), count }
}

const vertex = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragment = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec3 iResolution;
uniform vec2 iMouse;
uniform float iTime;
uniform float uAngle;
uniform float uNoise;
uniform float uBlindCount;
uniform float uSpotlightRadius;
uniform float uSpotlightSoftness;
uniform float uSpotlightOpacity;
uniform float uMirror;
uniform float uDistort;
uniform float uShineFlip;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;
uniform vec3 uColor6;
uniform vec3 uColor7;
uniform int uColorCount;

varying vec2 vUv;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 rotate2D(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

vec3 getGradientColor(float t) {
  int count = uColorCount;
  if (count < 2) count = 2;
  float scaled = clamp(t, 0.0, 1.0) * float(count - 1);
  float seg = floor(scaled);
  float f = fract(scaled);
  if (seg < 1.0) return mix(uColor0, uColor1, f);
  if (seg < 2.0 && uColorCount > 2) return mix(uColor1, uColor2, f);
  if (seg < 3.0 && uColorCount > 3) return mix(uColor2, uColor3, f);
  if (seg < 4.0 && uColorCount > 4) return mix(uColor3, uColor4, f);
  if (seg < 5.0 && uColorCount > 5) return mix(uColor4, uColor5, f);
  if (seg < 6.0 && uColorCount > 6) return mix(uColor5, uColor6, f);
  if (seg < 7.0 && uColorCount > 7) return mix(uColor6, uColor7, f);
  if (uColorCount > 7) return uColor7;
  if (uColorCount > 6) return uColor6;
  if (uColorCount > 5) return uColor5;
  if (uColorCount > 4) return uColor4;
  if (uColorCount > 3) return uColor3;
  if (uColorCount > 2) return uColor2;
  return uColor1;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv0 = fragCoord.xy / iResolution.xy;
  float aspect = iResolution.x / iResolution.y;
  vec2 p = uv0 * 2.0 - 1.0;
  p.x *= aspect;
  vec2 pr = rotate2D(p, uAngle);
  pr.x /= aspect;
  vec2 uvMod = pr * 0.5 + 0.5;

  if (uDistort > 0.0) {
    float w = 0.01 * uDistort;
    uvMod.x += sin(uvMod.y * 6.0) * w;
    uvMod.y += cos(uvMod.x * 6.0) * w;
  }

  float t = uvMod.x;
  if (uMirror > 0.5) t = 1.0 - abs(1.0 - 2.0 * fract(t));
  vec3 base = getGradientColor(t);
  vec2 offset = vec2(iMouse.x / iResolution.x, iMouse.y / iResolution.y);
  float distanceToPointer = length(uv0 - offset);
  float radius = max(uSpotlightRadius, 0.0001);
  float spot = (1.0 - 2.0 * pow(distanceToPointer / radius, uSpotlightSoftness)) * uSpotlightOpacity;
  float stripe = fract(uvMod.x * max(uBlindCount, 1.0));
  if (uShineFlip > 0.5) stripe = 1.0 - stripe;

  vec3 col = vec3(spot) + base - vec3(stripe);
  col += (rand(gl_FragCoord.xy + iTime) - 0.5) * uNoise;
  fragColor = vec4(col, 1.0);
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`

export default function GradientBlinds({
  className = '',
  dpr,
  paused = false,
  gradientColors,
  angle = 0,
  noise = 0.3,
  blindCount = 16,
  blindMinWidth = 60,
  mouseDampening = 0.15,
  mirrorGradient = false,
  spotlightRadius = 0.5,
  spotlightSoftness = 1,
  spotlightOpacity = 1,
  distortAmount = 0,
  shineDirection = 'left',
  mixBlendMode = 'lighten',
}: GradientBlindsProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new Renderer({
      dpr: dpr ?? Math.min(window.devicePixelRatio || 1, 1.5),
      alpha: true,
      antialias: true,
    })
    const gl = renderer.gl
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    canvas.setAttribute('aria-hidden', 'true')
    container.appendChild(canvas)

    const { arr, count } = prepStops(gradientColors)
    const uniforms = {
      iResolution: { value: [gl.drawingBufferWidth, gl.drawingBufferHeight, 1] },
      iMouse: { value: [0, 0] },
      iTime: { value: 0 },
      uAngle: { value: angle * Math.PI / 180 },
      uNoise: { value: noise },
      uBlindCount: { value: Math.max(1, blindCount) },
      uSpotlightRadius: { value: spotlightRadius },
      uSpotlightSoftness: { value: spotlightSoftness },
      uSpotlightOpacity: { value: spotlightOpacity },
      uMirror: { value: mirrorGradient ? 1 : 0 },
      uDistort: { value: distortAmount },
      uShineFlip: { value: shineDirection === 'right' ? 1 : 0 },
      uColor0: { value: arr[0] },
      uColor1: { value: arr[1] },
      uColor2: { value: arr[2] },
      uColor3: { value: arr[3] },
      uColor4: { value: arr[4] },
      uColor5: { value: arr[5] },
      uColor6: { value: arr[6] },
      uColor7: { value: arr[7] },
      uColorCount: { value: count },
    }
    const program = new Program(gl, { vertex, fragment, uniforms })
    const geometry = new Triangle(gl)
    const mesh = new Mesh(gl, { geometry, program })
    const mouseTarget: [number, number] = [0, 0]
    let frame = 0
    let lastTime = 0
    let firstResize = true

    const render = (time = 0) => {
      uniforms.iTime.value = time * 0.001
      renderer.render({ scene: mesh })
    }

    const resize = () => {
      const rect = container.getBoundingClientRect()
      renderer.setSize(rect.width, rect.height)
      uniforms.iResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight, 1]
      const maxByMinWidth = blindMinWidth > 0 ? Math.max(1, Math.floor(rect.width / blindMinWidth)) : blindCount
      uniforms.uBlindCount.value = Math.max(1, Math.min(blindCount, maxByMinWidth))
      if (firstResize) {
        firstResize = false
        mouseTarget[0] = uniforms.iMouse.value[0] = gl.drawingBufferWidth / 2
        mouseTarget[1] = uniforms.iMouse.value[1] = gl.drawingBufferHeight / 2
      }
      render()
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const scale = (renderer as Renderer & { dpr?: number }).dpr || 1
      mouseTarget[0] = (event.clientX - rect.left) * scale
      mouseTarget[1] = (rect.height - (event.clientY - rect.top)) * scale
      if (mouseDampening <= 0) uniforms.iMouse.value = [...mouseTarget]
    }

    const loop = (time: number) => {
      if (mouseDampening > 0) {
        const delta = lastTime ? (time - lastTime) / 1000 : 0
        const factor = 1 - Math.exp(-delta / Math.max(0.0001, mouseDampening))
        uniforms.iMouse.value[0] += (mouseTarget[0] - uniforms.iMouse.value[0]) * factor
        uniforms.iMouse.value[1] += (mouseTarget[1] - uniforms.iMouse.value[1]) * factor
      }
      lastTime = time
      render(time)
      frame = requestAnimationFrame(loop)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    canvas.addEventListener('pointermove', onPointerMove)
    if (!paused) frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointermove', onPointerMove)
      observer.disconnect()
      canvas.remove()
      geometry.remove()
      program.remove()
    }
  }, [
    angle, blindCount, blindMinWidth, distortAmount, dpr, gradientColors, mirrorGradient,
    mouseDampening, noise, paused, shineDirection, spotlightOpacity, spotlightRadius,
    spotlightSoftness,
  ])

  return <div ref={containerRef} className={`gradient-blinds-container ${className}`} style={{ mixBlendMode }} />
}
