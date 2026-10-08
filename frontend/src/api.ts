export type FeatureKind = 'binary' | 'number' | 'ordinal' | 'category'

export interface FeatureSpec {
  name: string
  label: string
  group: string
  kind: FeatureKind
  unit?: string
  step?: number
  min?: number
  max?: number
  normal?: [number, number]
  options?: Record<string, string>
  default: number | string
  derived?: boolean
}

export interface TargetSpec {
  label: string
  description: string
}

export interface Schema {
  version: string
  groups: Record<string, string>
  features: FeatureSpec[]
  targets: Record<string, TargetSpec>
  threshold: number
}

export interface Contribution {
  feature: string
  label: string
  group: string
  value: number | string
  unit?: string | null
  status?: 'low' | 'high' | 'normal' | null
  contribution: number
}

export interface TargetPrediction {
  probability: number
  positive: boolean
  model: string
  explanation: { base_value: number; units: string; contributions: Contribution[] }
}

export interface PredictResponse {
  predictions: Record<string, TargetPrediction>
  imputed: string[]
  derived: { BMI: number; Obesity: number }
  threshold: number
  disclaimer: string
}

interface MetricStat {
  mean: number
  std: number
  ci95: [number, number]
}

export interface CurveSet {
  roc: { fpr: number[]; tpr: number[] }
  calibration: { mean_predicted: number[]; fraction_positive: number[] }
  confusion: { tn: number; fp: number; fn: number; tp: number }
  oof_auc: number
}

export interface Metrics {
  cv: string
  threshold: number
  n: number
  prevalence: Record<string, number>
  selected: Record<string, string>
  metrics: Record<string, Record<string, Record<string, MetricStat>>>
  curves: Record<string, Record<string, CurveSet>>
}

export interface PatientSummary {
  id: number
  age: number
  sex: number
  labels: Record<string, number>
  oof_probability: Record<string, number>
}

export interface Patient extends PatientSummary {
  features: Record<string, number | string>
}

export type Features = Record<string, number | string>

// Backend origin. Empty = same origin (FastAPI serves the build, or the Vite dev proxy).
// For a split deploy (e.g. Vercel + Render) set VITE_API_URL=https://<backend>.onrender.com at build time.
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

async function get<T>(path: string): Promise<T> {
  const r = await fetch(API_BASE + path)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json()
}

export const api = {
  schema: () => get<Schema>('/api/schema'),
  metrics: () => get<Metrics>('/api/metrics'),
  importance: () => get<Record<string, Record<string, number>>>('/api/importance'),
  patients: () => get<PatientSummary[]>('/api/patients'),
  patient: (id: number) => get<Patient>(`/api/patients/${id}`),
  predict: async (features: Features, signal?: AbortSignal): Promise<PredictResponse> => {
    const r = await fetch(`${API_BASE}/api/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features }),
      signal,
    })
    if (!r.ok) throw new Error(`predict: ${r.status} ${await r.text()}`)
    return r.json()
  },
}

export const VESSELS = ['LAD', 'LCX', 'RCA'] as const
export type Vessel = (typeof VESSELS)[number]
export type Target = 'Cath' | Vessel
