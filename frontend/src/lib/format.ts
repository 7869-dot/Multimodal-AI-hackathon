import type { Contribution, FeatureSpec, Schema } from '../api'

export function specOf(schema: Schema, name: string): FeatureSpec | undefined {
  return schema.features.find((f) => f.name === name)
}

export function formatValue(spec: FeatureSpec | undefined, value: number | string): string {
  if (!spec) return String(value)
  if (spec.kind === 'binary') return Number(value) === 1 ? 'Yes' : 'No'
  if (spec.options) return spec.options[String(value)] ?? String(value)
  const n = Number(value)
  const s = Number.isInteger(n) ? String(n) : n.toFixed(spec.step && spec.step < 1 ? 1 : 0)
  return spec.unit ? `${s} ${spec.unit}` : s
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/** Convert a value in the model's explanation units to probability. */
export function toProb(x: number, units: string) {
  return units === 'log-odds' ? sigmoid(x) : x
}

export function describe(schema: Schema, c: Contribution) {
  return `${c.label} ${formatValue(specOf(schema, c.feature), c.value)}`
}
