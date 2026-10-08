/**
 * Procedural cardiac anatomy.
 *
 * The ventricular mass is a parametric surface S(u, v): u = azimuth around the
 * long axis (0 = patient's left / lateral wall, π/2 = anterior, π = right,
 * 3π/2 = posterior), v = 0 at the base pole to 1 at the apex. Coronary arteries
 * are polylines in (u, v) projected onto that surface, so they sit in the
 * anatomical grooves and move with the heart. Perfusion territories are
 * functions of (u, v) too, which lets the myocardium be tinted per vessel and
 * lets a click on the wall resolve to the supplying artery.
 *
 * To add a structure: add an entry to CORONARY_TREE (with the model target it
 * is coloured by) or to TERRITORIES — no rendering code changes are needed.
 */
import { CatmullRomCurve3, Vector3 } from 'three'
import type { Vessel } from '../api'

const TAU = Math.PI * 2
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const gauss = (d: number, w: number) => Math.exp(-((d / w) ** 2))
/** Smallest signed angular distance a-b in (-π, π]. */
export const angDist = (a: number, b: number) => {
  let d = (a - b) % TAU
  if (d > Math.PI) d -= TAU
  if (d <= -Math.PI) d += TAU
  return d
}

const ANT_GROOVE_U = 1.45 // anterior interventricular groove (LAD)
const POST_GROOVE_U = 4.5 // posterior interventricular groove (PDA)
const AV_GROOVE_V = 0.2 // atrioventricular groove (LCX / RCA)

/** Heart surface in the heart's local frame (y = base→apex axis, +x = patient left, +z = anterior). */
export function heartSurface(u: number, v: number, out = new Vector3()): Vector3 {
  const t = v * Math.PI
  const stretch = 0.82 + 0.68 * smooth(0.35, 0.9, v)
  const y = Math.cos(t) * stretch
  let r = Math.pow(Math.sin(t), 0.9) * (1 - 0.12 * v)
  // Right-ventricular bulge on the anterior-right side; it does not reach the apex.
  r *= 1 + 0.13 * gauss(angDist(u, 2.35), 0.95) * (1 - smooth(0.55, 0.92, v)) * smooth(0.1, 0.3, v)
  // Grooves where the arteries run.
  const ventricular = smooth(0.18, 0.3, v) * (1 - smooth(0.85, 0.98, v))
  r *= 1 - 0.05 * gauss(angDist(u, ANT_GROOVE_U), 0.13) * ventricular
  r *= 1 - 0.045 * gauss(angDist(u, POST_GROOVE_U), 0.13) * ventricular
  r *= 1 - 0.05 * gauss(v - AV_GROOVE_V, 0.035)
  return out.set(r * Math.cos(u) * 1.0, y, r * Math.sin(u) * 0.84)
}

export function surfaceNormal(u: number, v: number, out = new Vector3()): Vector3 {
  const e = 1e-3
  const p = heartSurface(u, v)
  const du = heartSurface(u + e, v).sub(p)
  const dv = heartSurface(u, Math.min(1, v + e)).sub(p)
  out.crossVectors(du, dv)
  if (out.lengthSq() < 1e-12) out.set(p.x, 0, p.z)
  out.normalize()
  // Ensure outward: pointing away from the long axis / poles.
  const radial = new Vector3(p.x, p.y * 0.3, p.z)
  if (out.dot(radial) < 0) out.negate()
  return out
}

/** Point on the epicardium lifted by `lift` along the normal. */
export function onSurface(u: number, v: number, lift = 0.03): Vector3 {
  return heartSurface(u, v).add(surfaceNormal(u, v).multiplyScalar(lift))
}

export type UV = [number, number]

export interface VesselSegment {
  name: string
  path: UV[]
  radius: number
  /** Optional free-space start point (e.g. the aortic sinus). */
  origin?: [number, number, number]
}

export interface VesselDef {
  id: Vessel
  label: string
  description: string
  segments: VesselSegment[]
  labelAt: UV
}

export const AORTIC_ROOT: [number, number, number] = [-0.05, 0.62, 0.12]

export const CORONARY_TREE: VesselDef[] = [
  {
    id: 'LAD',
    label: 'Left Anterior Descending',
    description: 'Runs in the anterior interventricular groove to the apex; supplies the anterior wall, anterior septum and apex.',
    labelAt: [ANT_GROOVE_U, 0.55],
    segments: [
      { name: 'Left main → LAD', origin: [0.12, 0.66, 0.2], path: [[1.0, 0.17], [1.25, 0.25], [1.4, 0.36], [ANT_GROOVE_U, 0.5], [ANT_GROOVE_U, 0.66], [1.43, 0.8], [1.35, 0.9], [1.2, 0.965]], radius: 0.036 },
      { name: 'First diagonal', path: [[1.38, 0.33], [1.15, 0.42], [0.88, 0.53], [0.66, 0.64]], radius: 0.022 },
      { name: 'Second diagonal', path: [[ANT_GROOVE_U, 0.6], [1.2, 0.68], [0.98, 0.78]], radius: 0.019 },
    ],
  },
  {
    id: 'LCX',
    label: 'Left Circumflex',
    description: 'Runs in the left atrioventricular groove around to the back; supplies the lateral and posterolateral wall.',
    labelAt: [0.0, 0.3],
    segments: [
      { name: 'Circumflex', path: [[1.0, 0.17], [0.65, AV_GROOVE_V], [0.2, AV_GROOVE_V + 0.01], [-0.35, AV_GROOVE_V + 0.01], [-0.85, AV_GROOVE_V + 0.02]], radius: 0.032 },
      { name: 'Obtuse marginal 1', path: [[0.3, AV_GROOVE_V + 0.01], [0.24, 0.38], [0.14, 0.55], [0.08, 0.7]], radius: 0.021 },
      { name: 'Obtuse marginal 2', path: [[-0.4, AV_GROOVE_V + 0.01], [-0.38, 0.4], [-0.33, 0.58]], radius: 0.019 },
    ],
  },
  {
    id: 'RCA',
    label: 'Right Coronary Artery',
    description: 'Runs in the right atrioventricular groove to the posterior heart; supplies the right ventricle and inferior wall (PDA).',
    labelAt: [3.14, 0.3],
    segments: [
      { name: 'Right coronary', origin: [-0.18, 0.62, 0.3], path: [[2.05, AV_GROOVE_V], [2.6, AV_GROOVE_V + 0.01], [3.14, AV_GROOVE_V + 0.02], [3.7, AV_GROOVE_V + 0.02], [4.25, AV_GROOVE_V + 0.01], [POST_GROOVE_U, 0.23]], radius: 0.034 },
      { name: 'Posterior descending (PDA)', path: [[POST_GROOVE_U, 0.23], [POST_GROOVE_U, 0.42], [4.48, 0.62], [4.44, 0.8]], radius: 0.022 },
      { name: 'Acute marginal', path: [[3.14, AV_GROOVE_V + 0.02], [3.1, 0.4], [3.0, 0.6]], radius: 0.02 },
      { name: 'Posterolateral branch', path: [[POST_GROOVE_U, 0.23], [4.85, 0.29], [5.1, 0.4]], radius: 0.018 },
    ],
  },
]

/** Densify a (u,v) polyline and project it onto the epicardium. */
export function segmentCurve(seg: VesselSegment): CatmullRomCurve3 {
  const pts: Vector3[] = []
  if (seg.origin) pts.push(new Vector3(...seg.origin))
  for (let i = 0; i < seg.path.length - 1; i++) {
    const [u0, v0] = seg.path[i]
    const [u1, v1] = seg.path[i + 1]
    const n = 6
    for (let k = 0; k < n; k++) {
      const t = k / n
      pts.push(onSurface(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, seg.radius * 0.9))
    }
  }
  const [ue, ve] = seg.path[seg.path.length - 1]
  pts.push(onSurface(ue, ve, seg.radius * 0.9))
  return new CatmullRomCurve3(pts, false, 'centripetal')
}

/**
 * Approximate perfusion territory of each vessel at (u, v) — the standard
 * AHA-style mapping (LAD: anterior/septal/apex, LCX: lateral, RCA: inferior/RV).
 * Returns weights in [0, 1]; their sum is < 1 so boundaries blend.
 */
export function territoryWeights(u: number, v: number): Record<Vessel, number> {
  const ventricular = smooth(AV_GROOVE_V - 0.02, AV_GROOVE_V + 0.08, v)
  const apex = smooth(0.8, 0.96, v)
  const lad = gauss(angDist(u, 1.6), 0.75) + 1.6 * apex
  const lcx = gauss(angDist(u, -0.15), 0.62) * (1 - apex)
  const rca = gauss(angDist(u, 3.7), 0.85) * (1 - apex)
  const sum = lad + lcx + rca + 0.12
  return { LAD: (lad / sum) * ventricular, LCX: (lcx / sum) * ventricular, RCA: (rca / sum) * ventricular }
}

export function dominantTerritory(u: number, v: number): Vessel | null {
  const w = territoryWeights(u, v)
  const best = (Object.keys(w) as Vessel[]).reduce((a, b) => (w[a] >= w[b] ? a : b))
  return w[best] > 0.3 ? best : null
}

/** Camera presets in world space (the heart group is rotated, see HeartScene). */
export const VIEWS: Record<string, [number, number, number]> = {
  Anterior: [0, 0.4, 7.2],
  'Left lateral': [7.0, 0.6, 0.8],
  Posterior: [0.2, 0.4, -7.2],
  Inferior: [0.8, -6.6, 2.4],
  'Right lateral': [-7.0, 0.6, 1.0],
}
