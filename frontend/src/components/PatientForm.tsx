import { useMemo, useState } from 'react'
import type { FeatureSpec, Features, PatientSummary, Schema } from '../api'

interface Props {
  schema: Schema
  features: Features
  derived: { BMI: number; Obesity: number } | null
  onChange: (name: string, value: number | string) => void
  patients: PatientSummary[]
  loadedId: number | null
  onLoadPatient: (id: number) => void
  onReset: () => void
}

function Field({ spec, value, onChange }: { spec: FeatureSpec; value: number | string; onChange: Props['onChange'] }) {
  const outOfRange =
    spec.kind === 'number' && spec.normal && typeof value === 'number' &&
    (value < spec.normal[0] || value > spec.normal[1])
  if (spec.kind === 'binary') {
    return (
      <label className="field field-binary">
        <span className="field-label">{spec.label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={value === 1}
          className={`switch ${value === 1 ? 'on' : ''}`}
          onClick={() => onChange(spec.name, value === 1 ? 0 : 1)}
        >
          <span>{value === 1 ? 'Yes' : 'No'}</span>
        </button>
      </label>
    )
  }
  if (spec.kind === 'ordinal' || spec.kind === 'category') {
    const opts = Object.entries(spec.options ?? {})
    return (
      <div className="field">
        <span className="field-label">{spec.label}</span>
        <div className="segmented">
          {opts.map(([k, label]) => {
            const v = spec.kind === 'ordinal' ? Number(k) : k
            return (
              <button type="button" key={k} className={String(value) === k ? 'active' : ''} onClick={() => onChange(spec.name, v)}>
                {label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  const num = Number(value)
  return (
    <div className={`field ${outOfRange ? 'abnormal' : ''}`}>
      <span className="field-label">
        {spec.label}
        {spec.normal && <small> normal {spec.normal[0]}–{spec.normal[1]}</small>}
      </span>
      <div className="numeric">
        <input
          type="range" min={spec.min} max={spec.max} step={spec.step ?? 1} value={num}
          onChange={(e) => onChange(spec.name, Number(e.target.value))}
          aria-label={spec.label}
        />
        <input
          type="number" step={spec.step ?? 1} value={num}
          onChange={(e) => e.target.value !== '' && onChange(spec.name, Number(e.target.value))}
        />
        <span className="unit">{spec.unit}</span>
      </div>
    </div>
  )
}

export default function PatientForm({ schema, features, derived, onChange, patients, loadedId, onLoadPatient, onReset }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ demographic: true, symptoms: true, echo: true })
  const [filter, setFilter] = useState('')
  const grouped = useMemo(() => {
    const g: Record<string, FeatureSpec[]> = {}
    for (const f of schema.features) (g[f.group] ??= []).push(f)
    return g
  }, [schema])
  const q = filter.trim().toLowerCase()

  const randomPatient = () => onLoadPatient(patients[Math.floor(Math.random() * patients.length)].id)

  return (
    <div className="form">
      <div className="form-presets">
        <label className="field-label" htmlFor="patient-select">Load a dataset patient</label>
        <select
          id="patient-select"
          value={loadedId ?? ''}
          onChange={(e) => e.target.value !== '' && onLoadPatient(Number(e.target.value))}
        >
          <option value="">— custom input —</option>
          {patients.map((p) => {
            const vessels = (['LAD', 'LCX', 'RCA'] as const).filter((v) => p.labels[v]).join('+') || 'no stenosis'
            return (
              <option key={p.id} value={p.id}>
                #{p.id} · {p.sex ? 'M' : 'F'} {p.age}y · {vessels}
              </option>
            )
          })}
        </select>
        <div className="row">
          <button type="button" onClick={randomPatient}>Random patient</button>
          <button type="button" onClick={onReset}>Median patient</button>
        </div>
        <input
          className="filter" placeholder="Filter features…" value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {Object.entries(grouped).map(([group, specs]) => {
        const visible = specs.filter((s) => !q || s.label.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
        if (!visible.length) return null
        const isOpen = q ? true : open[group] ?? false
        return (
          <section key={group} className="form-group">
            <button type="button" className="group-head" onClick={() => setOpen({ ...open, [group]: !isOpen })}>
              <span>{schema.groups[group]}</span>
              <span className="muted">{visible.length} {isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="group-body">
                {visible.map((spec) =>
                  spec.derived ? (
                    <div className="field derived" key={spec.name}>
                      <span className="field-label">{spec.label}</span>
                      <span className="derived-value">
                        {spec.name === 'BMI' ? derived?.BMI.toFixed(1) : derived?.Obesity ? 'Yes' : 'No'}
                        <small> auto from weight/height</small>
                      </span>
                    </div>
                  ) : (
                    <Field key={spec.name} spec={spec} value={features[spec.name] ?? spec.default} onChange={onChange} />
                  ),
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
