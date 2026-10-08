import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending, BufferAttribute, CatmullRomCurve3, Color, DoubleSide, EllipseCurve, Group,
  LatheGeometry, MeshStandardMaterial, TubeGeometry, Vector2, Vector3,
} from 'three'
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { VESSELS, type Target, type Vessel } from '../api'
import {
  AORTIC_ROOT, CORONARY_TREE, VIEWS, dominantTerritory, heartSurface, onSurface, segmentCurve,
  surfaceNormal, territoryWeights, type VesselDef,
} from '../anatomy/anatomy'
import { riskColor } from '../lib/color'

export interface SceneOptions {
  territories: boolean
  labels: boolean
  torso: boolean
  beat: boolean
}

export interface HoverInfo {
  vessel: Vessel
  part: string
}

interface Props {
  probs: Record<Vessel, number> | null
  selected: Target
  onSelect: (t: Target) => void
  onHover: (h: HoverInfo | null) => void
  options: SceneOptions
  heartRate: number
  view: { name: string; nonce: number }
  labelRefs: React.RefObject<LabelRefs>
}

const TAU = Math.PI * 2
const NEUTRAL = 0.5
const MYOCARDIUM = new Color('#a65a62')
const ATRIAL = new Color('#8c4652')
const UNKNOWN = new Color('#8b8f98')

type Probs = Record<Vessel, number>

/** Probabilities displayed in the scene, eased toward the latest prediction. */
function useEasedProbs(target: Probs | null) {
  const shown = useRef<Probs>({ LAD: NEUTRAL, LCX: NEUTRAL, RCA: NEUTRAL })
  const version = useRef(1)
  useFrame((_, dt) => {
    if (!target) return
    const k = 1 - Math.exp(-dt * 5)
    for (const v of VESSELS) {
      const d = target[v] - shown.current[v]
      if (Math.abs(d) > 1e-4) {
        shown.current[v] += d * k
        version.current++
      }
    }
  })
  return { shown, version }
}

function Myocardium({ probs, options, onSelect, onHover, hasPrediction }: {
  probs: ReturnType<typeof useEasedProbs>
  options: SceneOptions
  onSelect: (t: Target) => void
  onHover: (h: HoverInfo | null) => void
  hasPrediction: boolean
}) {
  const geometry = useMemo(() => {
    const g = new ParametricGeometry((u, v, target) => heartSurface(u * TAU, v, target), 128, 96)
    const uv = g.getAttribute('uv')
    const weights = new Float32Array(uv.count * 3)
    for (let i = 0; i < uv.count; i++) {
      const w = territoryWeights(uv.getX(i) * TAU, uv.getY(i))
      weights.set([w.LAD, w.LCX, w.RCA], i * 3)
    }
    g.userData.weights = weights
    g.setAttribute('color', new BufferAttribute(new Float32Array(uv.count * 3), 3))
    return g
  }, [])
  const drawn = useRef('')

  useFrame(() => {
    const key = `${probs.version.current}|${options.territories}|${hasPrediction}`
    if (drawn.current === key) return
    drawn.current = key
    const col = geometry.getAttribute('color') as BufferAttribute
    const uv = geometry.getAttribute('uv')
    const w = geometry.userData.weights as Float32Array
    const c = new Color()
    const tint = new Color()
    for (let i = 0; i < col.count; i++) {
      const v = uv.getY(i)
      c.copy(v < 0.17 ? ATRIAL : MYOCARDIUM)
      if (options.territories) {
        for (let k = 0; k < 3; k++) {
          const wk = w[i * 3 + k]
          if (wk < 0.01) continue
          if (hasPrediction) riskColor(probs.shown.current[VESSELS[k]], tint)
          else tint.copy(UNKNOWN)
          c.lerp(tint, Math.min(0.6, wk * 0.55))
        }
      }
      col.setXYZ(i, c.r, c.g, c.b)
    }
    col.needsUpdate = true
  })

  const resolve = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!e.uv) return null
    return dominantTerritory(e.uv.x * TAU, e.uv.y)
  }

  return (
    <mesh
      geometry={geometry}
      onClick={(e) => {
        e.stopPropagation()
        const t = resolve(e)
        onSelect(t ?? 'Cath')
      }}
      onPointerMove={(e) => {
        e.stopPropagation()
        const t = resolve(e)
        onHover(t ? { vessel: t, part: 'perfusion territory' } : null)
      }}
      onPointerOut={() => onHover(null)}
    >
      <meshPhysicalMaterial vertexColors roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.4} sheen={0.4} sheenColor="#ffb3b3" />
    </mesh>
  )
}

/** DOM labels live in the page overlay (see App); the scene only positions them. */
export type LabelRefs = Partial<Record<Vessel, HTMLElement | null>>

function VesselTree({ def, probs, selected, onSelect, onHover, hasPrediction, labelRefs }: {
  def: VesselDef
  probs: ReturnType<typeof useEasedProbs>
  selected: Target
  onSelect: (t: Target) => void
  onHover: (h: HoverInfo | null) => void
  hasPrediction: boolean
  labelRefs: React.RefObject<LabelRefs>
}) {
  const parts = useMemo(
    () => def.segments.map((s) => {
      const curve = segmentCurve(s)
      return {
        name: s.name,
        tube: new TubeGeometry(curve, 72, s.radius, 10, false),
        glow: new TubeGeometry(curve, 72, s.radius * 2.1, 10, false),
        end: curve.getPoint(1),
        radius: s.radius,
      }
    }),
    [def],
  )
  const mat = useMemo(() => new MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 }), [])
  const glowMat = useMemo(
    () => new MeshStandardMaterial({ transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    [],
  )
  const isSelected = selected === def.id
  const labelPos = useMemo(() => {
    const [u, v] = def.labelAt
    return onSurface(u, v, 0.32)
  }, [def])
  const labelNormal = useMemo(() => surfaceNormal(...def.labelAt), [def])
  const groupRef = useRef<Group>(null)
  const tmp = useMemo(() => ({ n: new Vector3(), p: new Vector3(), c: new Color() }), [])

  useFrame(({ clock, camera, size }) => {
    const p = probs.shown.current[def.id]
    if (hasPrediction) riskColor(p, tmp.c)
    else tmp.c.copy(UNKNOWN)
    mat.color.copy(tmp.c)
    mat.emissive.copy(tmp.c)
    const t = clock.elapsedTime
    const pulse = 0.5 + 0.5 * Math.sin(t * 4)
    mat.emissiveIntensity = 0.45 + (isSelected ? 0.35 * pulse : 0) + (hasPrediction && p > 0.6 ? 0.15 * pulse : 0)
    glowMat.color.copy(tmp.c)
    glowMat.opacity = isSelected ? 0.25 + 0.2 * pulse : 0
    // Project the label anchor to screen space; fade it when the vessel faces away.
    const el = labelRefs.current?.[def.id]
    if (el && groupRef.current) {
      tmp.n.copy(labelNormal).transformDirection(groupRef.current.matrixWorld)
      tmp.p.copy(labelPos).applyMatrix4(groupRef.current.matrixWorld)
      const facing = tmp.n.dot(camera.position.clone().sub(tmp.p).normalize())
      tmp.p.project(camera)
      const x = ((tmp.p.x + 1) / 2) * size.width
      const y = ((1 - tmp.p.y) / 2) * size.height
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      el.style.opacity = String(Math.min(1, Math.max(0.15, facing * 2 + 0.4)))
      el.style.visibility = tmp.p.z < 1 ? 'visible' : 'hidden'
    }
  })

  return (
    <group ref={groupRef}>
      {parts.map((part) => (
        <group key={part.name}>
          <mesh
            geometry={part.tube}
            material={mat}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(def.id)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              onHover({ vessel: def.id, part: part.name })
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              onHover(null)
              document.body.style.cursor = ''
            }}
          />
          <mesh geometry={part.glow} material={glowMat} raycast={() => null} />
          <mesh position={part.end} material={mat} raycast={() => null}>
            <sphereGeometry args={[part.radius, 10, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Atria and great vessels: anatomical context, not risk-mapped. */
function GreatVessels() {
  const geo = useMemo(() => {
    const tube = (pts: number[][], r: number) =>
      new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p))), 64, r, 16, false)
    return {
      aorta: tube([AORTIC_ROOT, [-0.08, 1.2, 0.12], [-0.02, 1.85, 0.0], [0.3, 2.1, -0.35], [0.55, 1.95, -0.75], [0.62, 1.45, -1.05], [0.6, 0.95, -1.15]], 0.19),
      pulmonary: tube([[-0.25, 0.5, 0.62], [0.0, 1.05, 0.55], [0.22, 1.42, 0.25], [0.3, 1.5, 0.0]], 0.17),
      lpa: tube([[0.3, 1.5, 0.0], [0.65, 1.55, -0.2], [1.05, 1.45, -0.35]], 0.12),
      rpa: tube([[0.3, 1.5, 0.0], [-0.2, 1.55, -0.3], [-0.85, 1.45, -0.35]], 0.12),
      svc: tube([[-0.62, 0.75, -0.05], [-0.62, 1.4, -0.05], [-0.6, 2.1, -0.05]], 0.14),
      ivc: tube([[-0.55, 0.3, -0.35], [-0.5, -0.4, -0.5], [-0.45, -1.1, -0.55]], 0.15),
    }
  }, [])
  return (
    <group>
      <mesh geometry={geo.aorta}><meshPhysicalMaterial color="#c4474f" roughness={0.45} clearcoat={0.3} /></mesh>
      <mesh geometry={geo.pulmonary}><meshPhysicalMaterial color="#5b6fb0" roughness={0.45} clearcoat={0.3} /></mesh>
      <mesh geometry={geo.lpa}><meshPhysicalMaterial color="#5b6fb0" roughness={0.45} /></mesh>
      <mesh geometry={geo.rpa}><meshPhysicalMaterial color="#5b6fb0" roughness={0.45} /></mesh>
      <mesh geometry={geo.svc}><meshPhysicalMaterial color="#4c5d9c" roughness={0.45} /></mesh>
      <mesh geometry={geo.ivc}><meshPhysicalMaterial color="#4c5d9c" roughness={0.45} /></mesh>
      {/* Right atrium + appendage */}
      <mesh position={[-0.68, 0.62, 0.05]} scale={[0.52, 0.48, 0.5]}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshPhysicalMaterial color="#8c4652" roughness={0.55} clearcoat={0.25} />
      </mesh>
      <mesh position={[-0.55, 0.72, 0.45]} scale={[0.28, 0.18, 0.2]} rotation={[0, 0, 0.4]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshPhysicalMaterial color="#8c4652" roughness={0.55} />
      </mesh>
      {/* Left atrium + appendage */}
      <mesh position={[0.25, 0.7, -0.5]} scale={[0.6, 0.38, 0.42]}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshPhysicalMaterial color="#8c4652" roughness={0.55} clearcoat={0.25} />
      </mesh>
      <mesh position={[0.72, 0.72, 0.18]} scale={[0.22, 0.14, 0.2]} rotation={[0, 0, -0.5]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshPhysicalMaterial color="#8c4652" roughness={0.55} />
      </mesh>
    </group>
  )
}

/** Translucent torso, rib cage, sternum and spine for spatial context. */
function Torso() {
  const geo = useMemo(() => {
    const profile = [
      [0.0, -5.2], [3.0, -5.2], [3.1, -4.2], [2.75, -2.6], [2.9, -0.8], [3.25, 1.2], [3.55, 2.8],
      [3.3, 3.6], [2.2, 4.1], [1.0, 4.4], [0.85, 5.4], [0.0, 5.4],
    ].map(([x, y]) => new Vector2(x, y))
    const body = new LatheGeometry(profile, 64)
    body.scale(1, 1, 0.62)
    const ribs: TubeGeometry[] = []
    for (let i = 0; i < 10; i++) {
      const y = 2.9 - i * 0.48
      const a = 2.35 + Math.sin((i / 9) * Math.PI) * 0.55
      const b = 1.55 + Math.sin((i / 9) * Math.PI) * 0.3
      const gap = 0.22 + i * 0.05 // costal cartilage gap widens downwards
      const ell = new EllipseCurve(0, 0, a, b, Math.PI / 2 + gap, Math.PI / 2 - gap + TAU, false, 0)
      const pts = ell.getPoints(48).map((p) => new Vector3(p.x, y, p.y - 0.1))
      ribs.push(new TubeGeometry(new CatmullRomCurve3(pts), 64, 0.06, 6, false))
    }
    return { body, ribs }
  }, [])
  return (
    <group position={[-0.45, -0.6, -0.35]}>
      <mesh geometry={geo.body} renderOrder={-1}>
        <meshStandardMaterial color="#8fb3e0" transparent opacity={0.07} side={DoubleSide} depthWrite={false} />
      </mesh>
      <mesh geometry={geo.body}>
        <meshBasicMaterial color="#9fc3ef" wireframe transparent opacity={0.03} depthWrite={false} />
      </mesh>
      {geo.ribs.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#e6edf7" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 1.6]}>
        <boxGeometry args={[0.35, 2.6, 0.12]} />
        <meshStandardMaterial color="#e6edf7" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.2, -1.55]}>
        <cylinderGeometry args={[0.2, 0.2, 9.5, 12]} />
        <meshStandardMaterial color="#e6edf7" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Heart(props: Props) {
  const { probs, options, heartRate } = props
  const eased = useEasedProbs(probs)
  const beatRef = useRef<Group>(null)
  const hasPrediction = probs !== null

  useFrame(({ clock }) => {
    if (!beatRef.current) return
    let s = 1
    if (options.beat) {
      const phase = (clock.elapsedTime * heartRate / 60) % 1
      const systole = phase < 0.3 ? Math.sin((phase / 0.3) * Math.PI) : 0
      s = 1 - 0.035 * systole
    }
    beatRef.current.scale.setScalar(s)
  })

  return (
    <group rotation={[-0.3, 0.4, 0.6]} position={[0.1, -0.1, 0]}>
      <group ref={beatRef}>
        <Myocardium probs={eased} options={options} onSelect={props.onSelect} onHover={props.onHover} hasPrediction={hasPrediction} />
        {CORONARY_TREE.map((def) => (
          <VesselTree
            key={def.id} def={def} probs={eased} selected={props.selected}
            onSelect={props.onSelect} onHover={props.onHover} hasPrediction={hasPrediction}
            labelRefs={props.labelRefs}
          />
        ))}
      </group>
      <GreatVessels />
    </group>
  )
}

function CameraRig({ view, torso }: { view: Props['view']; torso: boolean }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const goal = useRef<Vector3 | null>(null)
  useEffect(() => {
    const dir = new Vector3(...(VIEWS[view.name] ?? VIEWS.Anterior))
    goal.current = dir.multiplyScalar(torso ? 2.0 : 1)
  }, [view, torso])
  useEffect(() => {
    if (!controls) return
    const cancel = () => (goal.current = null)
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [controls])
  useFrame((_, dt) => {
    if (!goal.current) return
    camera.position.lerp(goal.current, 1 - Math.exp(-dt * 4))
    controls?.update()
    if (camera.position.distanceTo(goal.current) < 0.01) goal.current = null
  })
  return null
}

export default function HeartScene(props: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 7.2], fov: 42, near: 0.1, far: 100 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'default' }}
      onPointerMissed={() => props.onSelect('Cath')}
    >
      <color attach="background" args={['#0b1220']} />
      <hemisphereLight args={['#dfe9ff', '#2a1a1f', 0.9]} />
      <directionalLight position={[3, 5, 6]} intensity={2.0} />
      <directionalLight position={[-5, 2, -4]} intensity={0.8} color="#9fb8ff" />
      <pointLight position={[0, -3, 4]} intensity={6} color="#ffd6d6" />
      <Heart {...props} />
      {props.options.torso && <Torso />}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={2.6} maxDistance={16} target={[0, 0.2, 0]} />
      <CameraRig view={props.view} torso={props.options.torso} />
    </Canvas>
  )
}
