import { Color } from 'three'

// Risk scale: low -> moderate -> high. Shared by the 3D scene and the dashboard
// so a vessel's colour on the heart always matches its bar in the panel.
const STOPS: [number, Color][] = [
  [0.0, new Color('#22c55e')],
  [0.35, new Color('#a3d13a')],
  [0.55, new Color('#f5b83d')],
  [0.75, new Color('#f97316')],
  [1.0, new Color('#ef4444')],
]

export function riskColor(p: number, out = new Color()): Color {
  const x = Math.min(1, Math.max(0, p))
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i]
    if (x <= p1) {
      const [p0, c0] = STOPS[i - 1]
      return out.copy(c0).lerp(c1, (x - p0) / (p1 - p0))
    }
  }
  return out.copy(STOPS[STOPS.length - 1][1])
}

export const riskHex = (p: number) => '#' + riskColor(p).getHexString()

export function riskBand(p: number): string {
  if (p < 0.3) return 'Low'
  if (p < 0.55) return 'Borderline'
  if (p < 0.75) return 'Elevated'
  return 'High'
}

export const pct = (p: number) => `${Math.round(p * 100)}%`

export const RISK_GRADIENT_CSS = `linear-gradient(90deg, ${STOPS.map(
  ([p, c]) => `#${c.getHexString()} ${p * 100}%`,
).join(', ')})`
