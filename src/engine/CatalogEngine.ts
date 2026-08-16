import * as THREE from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { Category, Show } from '../data/catalog'
import { FistShuffleRecognizer, fistShuffleVector, HandSelectionIntent, palmMotionVector, type Gesture } from '../lib/gestures'
import { dampVelocity, smoothFollow, stepSpring, wrap, type Spring } from '../lib/physics'
import type { LiquidSound } from '../lib/sound'

type TileRecord = {
  mesh: THREE.Mesh
  show: Show
  row: number
  column: number
  focus: Spring
  focusNode: { value: number }
}

export type EngineEvents = {
  onSelect: (show: Show) => void
  onTrackingPoint: (point: { x: number; y: number }, active: boolean) => void
  onRenderer: (label: string) => void
}

const TILE_W = 3.2
const TILE_H = 1.8
const GAP_X = 0.12
const GAP_Y = 0.14
const BAND_H = TILE_H + GAP_Y
const {
  color,
  cameraPosition,
  equirectUV,
  float,
  max,
  min,
  mix,
  modelWorldMatrix,
  normalLocal,
  positionLocal,
  positionWorld,
  smoothstep,
  texture: textureNode,
  transformNormal,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} = TSL as Record<string, any>

export class CatalogEngine {
  private renderer: THREE.WebGPURenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80)
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2(0, 0)
  private tiles: TileRecord[] = []
  private pan = new THREE.Vector2()
  private handPanTarget = new THREE.Vector2()
  private velocity = new THREE.Vector2()
  private dragging = false
  private dragOrigin = new THREE.Vector2()
  private lastPointer = new THREE.Vector2()
  private pointerDownAt = new THREE.Vector2()
  private tapCandidate = false
  private focused?: TileRecord
  private hoveredId?: string
  private previousGesture: Gesture = 'idle'
  private lastHandPoint = new THREE.Vector2()
  private handManipulating = false
  private lastHandSampleAt = 0
  private handSelection = new HandSelectionIntent()
  private fistShuffle = new FistShuffleRecognizer()
  private shuffleSequence = 0
  private handVisible = false
  private handTargeting = false
  private frame = 0
  private lastTime = performance.now()
  private lastMoveSound = 0
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('reduce-motion')
  private categoryCount: number
  private columns: number
  private totalWidth: number
  private totalHeight: number
  private disposed = false
  private environmentTexture?: THREE.DataTexture
  private catalogGeometry?: THREE.PlaneGeometry
  private textures = new Set<THREE.Texture>()
  private isWebGL = false

  constructor(
    private canvas: HTMLCanvasElement,
    private catalog: Category[],
    private events: EngineEvents,
    private sound: LiquidSound,
  ) {
    this.categoryCount = catalog.length
    this.columns = Math.max(...catalog.map((category) => category.shows.length))
    this.totalWidth = this.columns * (TILE_W + GAP_X)
    this.totalHeight = this.categoryCount * BAND_H
    const forceWebGL = new URLSearchParams(location.search).has('force-webgl')
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false, forceWebGL })
  }

  async init() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    await this.renderer.init()
    if (this.disposed) {
      this.renderer.dispose()
      return
    }
    const backendName = this.renderer.backend.constructor.name
    this.isWebGL = !backendName.includes('WebGPU')
    this.events.onRenderer(backendName.includes('WebGPU') ? 'WebGPU · TSL' : 'WebGL2 fallback · TSL')

    this.camera.position.set(0, 0.15, 10.8)
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.8))
    const key = new THREE.DirectionalLight(0xdce9ff, 3.1)
    key.position.set(-4, 6, 10)
    this.scene.add(key)
    await this.createCatalog()
    if (this.disposed) return
    this.bindEvents()
    this.resize()
    this.frame = requestAnimationFrame(this.animate)
  }

  private async createCatalog() {
    const loader = new THREE.TextureLoader()
    if (!this.isWebGL) this.environmentTexture = this.makeStudioEnvironment()
    // The card is deliberately a plane. Its slab silhouette, bevel and optics are
    // reconstructed in TSL rather than delegated to a built-in glass material.
    const geometry = new THREE.PlaneGeometry(TILE_W, TILE_H, 24, 12)
    this.catalogGeometry = geometry
    const loadTexture = (url: string) => loader.loadAsync(url)

    for (let row = 0; row < this.catalog.length; row++) {
      if (this.disposed) return
      const category = this.catalog[row]
      for (let column = 0; column < category.shows.length; column++) {
        const show = category.shows[column]
        const map = await loadTexture(show.image)
        if (this.disposed) {
          map.dispose()
          return
        }
        this.textures.add(map)
        map.colorSpace = THREE.SRGBColorSpace
        try {
          map.anisotropy = Math.min(8, this.renderer.getMaxAnisotropy())
        } catch {
          map.anisotropy = 1
        }
        const focusNode = uniform(0)
        const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: true })

        // Rounded-box SDF and bevel height field. The surface normal is rebuilt
        // from finite differences of the actual height field—not from UV position.
        const cardUv = uv()
        const aspect = TILE_W / TILE_H
        const centered = vec2(cardUv.x.sub(0.5).mul(aspect), cardUv.y.sub(0.5))
        const radius = float(0.105)
        const bounds = vec2(aspect * 0.5, 0.5).sub(radius)
        const roundedBoxSdf = (point: any) => {
          const distance = point.abs().sub(bounds)
          return max(distance, vec2(0)).length().add(min(max(distance.x, distance.y), 0)).sub(radius)
        }
        // Keep the optical treatment in a narrow perimeter band. The reference
        // reads as clear artwork with a weighted glass edge, not a tinted slab.
        const bevelWidth = float(0.052)
        const surfaceHeight = (point: any) => {
          const inset = roundedBoxSdf(point).negate().clamp(0, bevelWidth)
          const radialDistance = bevelWidth.sub(inset)
          return max(bevelWidth.pow(2).sub(radialDistance.pow(2)), 0).sqrt().div(bevelWidth)
        }
        const sdf = roundedBoxSdf(centered)
        const alpha = smoothstep(0.0025, -0.0025, sdf)
        const edgeProximity = surfaceHeight(centered).oneMinus().mul(alpha)
        const epsilon = float(0.004)
        const heightLeft = surfaceHeight(centered.sub(vec2(epsilon, 0)))
        const heightRight = surfaceHeight(centered.add(vec2(epsilon, 0)))
        const heightDown = surfaceHeight(centered.sub(vec2(0, epsilon)))
        const heightUp = surfaceHeight(centered.add(vec2(0, epsilon)))
        const gradient = vec2(heightRight.sub(heightLeft), heightUp.sub(heightDown)).div(epsilon.mul(2))

        // The local slope continues the field curvature across each tile. Mesh
        // rotation supplies the curvature at the tile center; this supplies it
        // between centers so adjacent planes read as one continuous surface.
        const fieldSlope = vec2(positionLocal.x.mul(0.012), positionLocal.y.mul(0.009))
        const rebuiltNormal = vec3(
          gradient.x.negate().mul(0.045).add(fieldSlope.x),
          gradient.y.negate().mul(0.045).add(fieldSlope.y),
          1,
        ).normalize()

        const undistorted = textureNode(map, cardUv).rgb
        let glass: any

        if (this.isWebGL) {
          // The fallback keeps the same TSL SDF and reconstructed bevel normal,
          // but avoids matrix inversion and HDR texture sampling that are not
          // consistently supported by the WebGL node backend.
          const fallbackOffset = rebuiltNormal.xy.mul(vec2(0.014 / aspect, 0.014)).mul(edgeProximity)
          const fallbackR = textureNode(map, cardUv.add(fallbackOffset.mul(1.035))).r
          const fallbackG = textureNode(map, cardUv.add(fallbackOffset)).g
          const fallbackB = textureNode(map, cardUv.add(fallbackOffset.mul(0.965))).b
          const fallbackDispersed = vec3(fallbackR, fallbackG, fallbackB)
          glass = mix(undistorted, fallbackDispersed, edgeProximity.pow(1.65).mul(0.52))
        } else {
          // Transform the camera into tile-local space, refract its incident ray,
          // and intersect that ray with the artwork plane behind the glass slab.
          const localCamera = modelWorldMatrix.inverse().mul(vec4(cameraPosition, 1)).xyz
          const viewDirectionLocal = localCamera.sub(positionLocal).normalize()
          const incidentRay = viewDirectionLocal.negate()
          const sampleThroughSlab = (ior: number) => {
            const ray = incidentRay.refract(rebuiltNormal, float(1 / ior)).normalize()
            const travel = float(0.13).div(max(ray.z.abs(), 0.25))
            const uvOffset = vec2(ray.x.div(TILE_W), ray.y.div(TILE_H)).mul(travel)
            return textureNode(map, cardUv.add(uvOffset))
          }
          const sampleR = sampleThroughSlab(1.495).r
          const sampleG = sampleThroughSlab(1.5).g
          const sampleB = sampleThroughSlab(1.505).b
          const dispersed = vec3(sampleR, sampleG, sampleB)
          const opticalWeight = edgeProximity.pow(1.58).mul(0.66)
          const refracted = mix(undistorted, dispersed, opticalWeight)

          // Sample a genuine high-dynamic-range equirectangular environment with
          // the reflected world-space view ray. Fresnel makes it live at the edge.
          const normalWorld = transformNormal(rebuiltNormal)
          const viewDirectionWorld = cameraPosition.sub(positionWorld).normalize()
          const reflectedWorld = viewDirectionWorld.negate().reflect(normalWorld).normalize()
          const environment = textureNode(this.environmentTexture!, equirectUV(reflectedWorld)).rgb
          const dotNV = max(normalWorld.dot(viewDirectionWorld), 0).clamp(0, 1)
          const fresnel = float(0.018).add(float(0.982).mul(dotNV.oneMinus().pow(5)))
          const lightDirection = vec3(-0.38, 0.64, 0.67).normalize()
          const specular = max(rebuiltNormal.dot(lightDirection), 0)
            .pow(110)
            .mul(edgeProximity.pow(1.35))
            .mul(0.038)
          const reflectionWeight = fresnel.mul(edgeProximity.pow(1.45)).mul(0.72)
          const transmission = refracted.mul(float(1).sub(reflectionWeight.mul(0.22)))
          glass = transmission
            .add(environment.mul(reflectionWeight.mul(0.15)))
            .add(vec3(specular))
        }
        const elevatedGlass = mix(glass, color('#d8ecff'), edgeProximity.pow(1.08).mul(0.12))
        const focusedGlass = mix(elevatedGlass, elevatedGlass.mul(1.025).add(color(0xffffff).mul(0.006)), focusNode)

        material.outputNode = vec4(focusedGlass, alpha)
        // Keep the plane geometry stable across WebGPU implementations. The SDF
        // height field is expressed through its reconstructed optical normal.
        material.positionNode = positionLocal.add(normalLocal.mul(focusNode.mul(0.05)))
        const mesh = new THREE.Mesh(geometry, material)
        mesh.userData.showId = show.id
        mesh.userData.selectable = true
        this.scene.add(mesh)
        this.tiles.push({
          mesh,
          show,
          row,
          column,
          focus: { value: 0, velocity: 0, target: 0 },
          focusNode: focusNode as unknown as { value: number },
        })
      }
    }
  }

  private makeStudioEnvironment() {
    const width = 256
    const height = 128
    const data = new Uint16Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = x / (width - 1)
        const v = y / (height - 1)
        const horizon = Math.exp(-Math.pow((v - 0.52) / 0.16, 2))
        const softbox = Math.exp(-Math.pow((u - 0.19) / 0.085, 2)) * Math.exp(-Math.pow((v - 0.34) / 0.3, 2))
        const strip = Math.exp(-Math.pow((u - 0.72) / 0.042, 2)) * Math.exp(-Math.pow((v - 0.44) / 0.4, 2))
        const warm = Math.exp(-Math.pow((u - 0.89) / 0.075, 2)) * Math.exp(-Math.pow((v - 0.62) / 0.22, 2))
        const sky = 0.025 + (1 - v) * 0.045
        const index = (y * width + x) * 4
        data[index] = THREE.DataUtils.toHalfFloat(sky * 0.72 + horizon * 0.05 + softbox * 2.1 + strip * 0.72 + warm * 0.44)
        data[index + 1] = THREE.DataUtils.toHalfFloat(sky * 0.92 + horizon * 0.06 + softbox * 2.2 + strip * 0.82 + warm * 0.2)
        data[index + 2] = THREE.DataUtils.toHalfFloat(sky * 1.18 + horizon * 0.08 + softbox * 2.4 + strip * 1.02 + warm * 0.08)
        data[index + 3] = THREE.DataUtils.toHalfFloat(1)
      }
    }
    const environment = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType)
    environment.mapping = THREE.EquirectangularReflectionMapping
    environment.wrapS = THREE.RepeatWrapping
    environment.minFilter = THREE.LinearFilter
    environment.magFilter = THREE.LinearFilter
    environment.needsUpdate = true
    return environment
  }

  private bindEvents() {
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
    this.canvas.addEventListener('click', this.onClick)
    this.canvas.addEventListener('keydown', this.onKeyDown)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('resize', this.resize)
  }

  private setPointer(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1))
    this.events.onTrackingPoint({ x: (this.pointer.x + 1) / 2, y: 1 - (this.pointer.y + 1) / 2 }, this.dragging)
  }

  private onPointerMove = (event: PointerEvent) => {
    this.setPointer(event.clientX, event.clientY)
    if (!this.dragging) return
    const current = new THREE.Vector2(event.clientX, event.clientY)
    const delta = current.clone().sub(this.lastPointer)
    this.applyPan(delta.x * 0.012, -delta.y * 0.012)
    this.velocity.set(delta.x * 0.24, -delta.y * 0.24)
    this.lastPointer.copy(current)
  }

  private onPointerDown = (event: PointerEvent) => {
    this.canvas.setPointerCapture(event.pointerId)
    this.setPointer(event.clientX, event.clientY)
    this.dragging = true
    this.dragOrigin.set(event.clientX, event.clientY)
    this.pointerDownAt.copy(this.dragOrigin)
    this.lastPointer.copy(this.dragOrigin)
    this.velocity.set(0, 0)
  }

  private onPointerUp = (event: PointerEvent) => {
    if (!this.dragging) return
    this.dragging = false
    const moved = new THREE.Vector2(event.clientX, event.clientY).distanceTo(this.pointerDownAt)
    this.tapCandidate = moved < 8
  }

  private onClick = (event: MouseEvent) => {
    if (!this.tapCandidate) return
    this.tapCandidate = false
    this.setPointer(event.clientX, event.clientY)
    this.updateFocus()
    this.selectFocused()
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault()
    this.applyPan(-event.deltaX * 0.005, event.deltaY * 0.006)
    this.velocity.set(-event.deltaX * 0.08, event.deltaY * 0.08)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const movement = 0.72
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const direction = event.key === 'ArrowLeft' ? 1 : -1
      this.applyPan(direction * movement, 0)
      this.velocity.set(direction * 3.6, 0)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const direction = event.key === 'ArrowUp' ? -1 : 1
      this.applyPan(0, direction * movement)
      this.velocity.set(0, direction * 3.6)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!this.catalogIsMoving()) this.selectFocused()
    }
  }

  private applyPan(x: number, y: number) {
    this.pan.x += x
    this.pan.y += y
    const now = performance.now()
    if (now - this.lastMoveSound > 85) {
      this.sound.move(Math.hypot(x, y))
      this.lastMoveSound = now
    }
  }

  updateHand(point: { x: number; y: number }, gesture: Gesture, visible: boolean, airTapCandidate = false, airTap = false) {
    if (!visible) {
      this.handVisible = false
      this.handTargeting = false
      this.previousGesture = 'idle'
      this.lastHandSampleAt = 0
      this.handManipulating = false
      this.handSelection.reset()
      this.fistShuffle.reset()
      return
    }
    this.handVisible = true
    const now = performance.now()
    const next = new THREE.Vector2(point.x, point.y)
    const previousHandPoint = this.lastHandPoint.clone()
    const handDt = this.lastHandSampleAt ? Math.max((now - this.lastHandSampleAt) / 1000, 1 / 120) : 0
    this.lastHandSampleAt = now
    this.lastHandPoint.copy(next)
    const screenPoint = { x: (point.x + 1) / 2, y: 1 - (point.y + 1) / 2 }
    const palmNavigating = gesture === 'palm'
    this.events.onTrackingPoint(screenPoint, airTapCandidate || palmNavigating || gesture === 'grab')

    this.handManipulating = false
    if (palmNavigating) {
      this.handManipulating = true
      if (this.previousGesture === 'palm' && handDt) {
        const motion = palmMotionVector(previousHandPoint, next)
        const motionLength = Math.hypot(motion.x, motion.y)
        if (motionLength > 0.0015) {
          const panScale = this.handPanScale()
          const movementX = motion.x * panScale.x
          const movementY = motion.y * panScale.y
          this.handPanTarget.x += movementX
          this.handPanTarget.y += movementY
          this.soundForMovement(movementX, movementY)
          const inherited = new THREE.Vector2(movementX / handDt, movementY / handDt).clampLength(0, 30)
          this.velocity.lerp(inherited, 0.58)
        } else {
          this.velocity.multiplyScalar(0.72)
        }
      } else {
        this.velocity.set(0, 0)
        this.handPanTarget.copy(this.pan)
        // Entering a manipulation interrupts any inherited momentum instantly.
      }
    }
    // Pointing owns the ray immediately. Do not make the user wait for stale
    // palm momentum to decay before a newly settled viewport becomes targetable.
    if (gesture === 'point' && this.previousGesture === 'palm') this.velocity.set(0, 0)
    if (this.fistShuffle.update(gesture)) this.launchFistShuffle()
    const selection = this.handSelection.update(gesture, this.catalogIsMoving(), airTapCandidate, airTap)
    this.handTargeting = selection.trackTarget || selection.armed || selection.select
    if (selection.trackTarget) {
      // Pointing is direct manipulation: the ray follows the current fingertip
      // sample with no fixed lerp delay. Air-tap targeting locks separately.
      this.pointer.copy(next)
    }
    if (selection.select) {
      this.updateFocus()
      this.selectFocused()
    }
    this.previousGesture = gesture
  }

  private handPanScale() {
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * this.camera.position.z
    return { x: visibleHeight * this.camera.aspect * 0.5, y: visibleHeight * 0.5 }
  }

  private launchFistShuffle() {
    const throwVelocity = fistShuffleVector(this.shuffleSequence, this.totalWidth, this.totalHeight)
    this.shuffleSequence += 1
    const direction = new THREE.Vector2(throwVelocity.x, throwVelocity.y)
    if (this.reducedMotion) {
      direction.normalize()
      this.applyPan(direction.x * 1.3, direction.y * 1.3)
      this.velocity.set(0, 0)
      return
    }
    this.velocity.copy(direction)
    this.sound.move(1)
  }

  private soundForMovement(x: number, y: number) {
    const now = performance.now()
    if (now - this.lastMoveSound > 85) {
      this.sound.move(Math.hypot(x, y))
      this.lastMoveSound = now
    }
  }

  private selectFocused() {
    if (!this.focused) return
    this.sound.select()
    this.events.onSelect(this.focused.show)
  }

  private updateLayout(dt: number) {
    if (this.handManipulating) {
      if (this.reducedMotion) {
        this.pan.copy(this.handPanTarget)
      } else {
        // Camera inference updates less often than the display. Following the
        // latest hand target on every RAF fills those missing presentation
        // frames while retaining an immediate, interruptible response.
        this.pan.x = smoothFollow(this.pan.x, this.handPanTarget.x, dt, 34)
        this.pan.y = smoothFollow(this.pan.y, this.handPanTarget.y, dt, 34)
      }
    } else if (!this.dragging) {
      if (this.reducedMotion) {
        this.velocity.set(0, 0)
      } else {
        this.pan.x += this.velocity.x * dt
        this.pan.y += this.velocity.y * dt
        this.velocity.x = dampVelocity(this.velocity.x, 6.4, dt)
        this.velocity.y = dampVelocity(this.velocity.y, 6.4, dt)
      }
    }

    for (const tile of this.tiles) {
      const baseX = (tile.column - (this.columns - 1) / 2) * (TILE_W + GAP_X)
      const baseBandY = ((this.categoryCount - 1) / 2 - tile.row) * BAND_H
      const x = wrap(baseX + this.pan.x, this.totalWidth)
      // Rows wrap from a shared band origin, preserving the compact lattice.
      const y = wrap(baseBandY + this.pan.y, this.totalHeight)
      // A shallow spherical wall spans beyond the viewport. Depth and orientation
      // share the same field, but the outer columns do not close into a globe.
      const curve = -0.024 * x * x - 0.018 * y * y
      const focus = stepSpring(tile.focus, dt, this.reducedMotion ? 450 : 260, this.reducedMotion ? 45 : 30)
      tile.focusNode.value = focus
      tile.mesh.position.set(x, y, curve + focus * 0.72)
      tile.mesh.rotation.set(-y * 0.024, x * 0.038, -x * y * 0.0007)
      const scale = 1 + focus * (this.reducedMotion ? 0.015 : 0.085)
      tile.mesh.scale.setScalar(scale)
    }

  }

  private updateFocus() {
    if (this.catalogIsMoving() || (this.handVisible && !this.handTargeting)) {
      this.focused = undefined
      this.hoveredId = undefined
      for (const tile of this.tiles) tile.focus.target = 0
      return
    }
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.tiles.map((tile) => tile.mesh), false)
    const mesh = hits[0]?.object
    const next = mesh ? this.tiles.find((tile) => tile.mesh === mesh) : undefined
    if (next?.show.id !== this.hoveredId) {
      if (next) this.sound.focus(1)
      this.hoveredId = next?.show.id
    }
    this.focused = next
    const focusPosition = next?.mesh.position
    for (const tile of this.tiles) {
      if (!focusPosition) tile.focus.target = 0
      else {
        const distance = tile.mesh.position.distanceTo(focusPosition)
        tile.focus.target = tile === next ? 1 : Math.max(0, 1 - distance / 5.2) * 0.24
      }
    }
  }

  private catalogIsMoving() {
    return this.dragging || this.handManipulating || this.velocity.lengthSq() >= 0.12
  }

  private animate = (time: number) => {
    if (this.disposed) return
    const dt = Math.min((time - this.lastTime) / 1000, 1 / 20)
    this.lastTime = time
    this.updateLayout(dt)
    this.updateFocus()
    this.renderer.render(this.scene, this.camera)
    this.frame = requestAnimationFrame(this.animate)
  }

  private resize = () => {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (!width || !height) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('click', this.onClick)
    this.canvas.removeEventListener('keydown', this.onKeyDown)
    this.canvas.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('resize', this.resize)
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        const material = object.material as THREE.Material
        material.dispose()
      }
    })
    this.catalogGeometry?.dispose()
    this.textures.forEach((texture) => texture.dispose())
    this.textures.clear()
    this.environmentTexture?.dispose()
    this.renderer.dispose()
  }
}
