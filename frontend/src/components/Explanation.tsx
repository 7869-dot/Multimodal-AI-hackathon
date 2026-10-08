import { useState } from 'react'
import type { Schema, Target, TargetPrediction } from '../api'
import { pct } from '../lib/color'
import { describe, formatValue, specOf, toProb } from '../lib/format'

interface Props {
  schema: Schema
  target: Target
  pred: TargetPrediction
  globalImportance?: Record<string, number>
}

const UP = '#ef4444'
const DOWN = '#3b82f6'

export default function Explanation({ schema, target, pred, globalImportance }: Props) {
  const [topN, setTopN] = useState(10)
  const { base_value: base, units, contributions } = pred.explanation
  const top = contributions.slice(0, topN)
  const rest = contributions.slice(topN)
  const restSum = rest.reduce((s, c) => s + c.contribution, 0)
  const rows = [
    ...top.map((c) => ({ key: c.feature, label: c.label, value: formatValue(specOf(schema, c.feature), c.value), status: c.status, delta: c.contribution })),
    ...(rest.length ? [{ key: '__rest', label: `${rest.length} other features`, value: '', status: null, delta: restSum }] : []),
  ]
  let cum = base
  const steps = rows.map((r) => {
    const start = cum
    cum += r.delta
    return { ...r, start, end: cum }
  })
  const final = cum
  const xs = [base, final, ...steps.flatMap((s) => [s.start, s.end])]
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  const pad = (hi - lo) * 0.06 || 0.1
  const scale = (x: number) => ((x - (lo - pad)) / (hi - lo + 2 * pad)) * 100

  const increasing = contributions.filter((c) => c.contribution > 0).slice(0, 3)
  const decreasing = contributions.filter((c) => c.contribution < 0).slice(0, 3)
  const tLabel = target === 'Cath' ? 'overall CAD' : `${target} stenosis`
  const unitNote = units === 'log-odds' ? 'log-odds' : 'probability points'

  return (
    <div className="explanation">
      <p className="summary">
        Predicted {tLabel} probability is <b>{pct(pred.probability)}</b>, compared with a
        baseline of <b>{pct(toProb(base, units))}</b> for an average patient in the dataset.
        {increasing.length > 0 && (
          <> Pushing risk <span style={{ color: UP }}>up</span>: {increasing.map((c) => describe(schema, c)).join('; ')}.</>
        )}
        {decreasing.length > 0 && (
          <> Pulling risk <span style={{ color: DOWN }}>down</span>: {decreasing.map((c) => describe(schema, c)).join('; ')}.</>
        )}
      </p>

      <div className="waterfall" role="table" aria-label="SHAP contribution waterfall">
        <div className="wf-row wf-edge">
          <span className="wf-label">Baseline (average patient)</span>
          <span className="wf-value" />
          <span className="wf-track"><span className="wf-marker" style={{ left: `${scale(base)}%` }} /></span>
          <span className="wf-num">{pct(toProb(base, units))}</span>
        </div>
        {steps.map((s) => {
          const left = scale(Math.min(s.start, s.end))
          const width = Math.max(0.6, Math.abs(scale(s.end) - scale(s.start)))
          const up = s.delta >= 0
          return (
            <div className="wf-row" key={s.key}>
              <span className="wf-label" title={s.label}>{s.label}</span>
              <span className={`wf-value ${s.status && s.status !== 'normal' ? 'abnormal' : ''}`}>{s.value}</span>
              <span className="wf-track">
                <span className="wf-bar" style={{ left: `${left}%`, width: `${width}%`, background: up ? UP : DOWN }} />
              </span>
              <span className="wf-num" style={{ color: up ? UP : DOWN }}>
                {up ? '+' : '−'}{Math.abs(s.delta).toFixed(units === 'log-odds' ? 2 : 3)}
              </span>
            </div>
          )
        })}
        <div className="wf-row wf-edge">
          <span className="wf-label"><b>Prediction</b></span>
          <span className="wf-value" />
          <span className="wf-track"><span className="wf-marker final" style={{ left: `${scale(final)}%` }} /></span>
          <span className="wf-num"><b>{pct(toProb(final, units))}</b></span>
        </div>
      </div>
      <div className="row between small muted">
        <span>
          SHAP values in {unitNote} ({pred.model}). Red raises risk; blue lowers it.
        </span>
        <select value={topN} onChange={(e) => setTopN(Number(e.target.value))} aria-label="Number of features shown">
          {[5, 10, 15, 25, 60].map((n) => <option key={n} value={n}>{n >= 60 ? 'All' : `Top ${n}`}</option>)}
        </select>
      </div>

      {globalImportance && (
        <details className="global-imp">
          <summary>What this model relies on across all patients (global mean |SHAP|)</summary>
          <GlobalBars schema={schema} imp={globalImportance} />
        </details>
      )}
    </div>
  )
}

export function GlobalBars({ schema, imp, n = 10 }: { schema: Schema; imp: Record<string, number>; n?: number }) {
  const entries = Object.entries(imp).slice(0, n)
  const max = Math.max(...entries.map(([, v]) => v))
  return (
    <div className="global-bars">
      {entries.map(([f, v]) => (
        <div key={f} className="gb-row">
          <span className="gb-label">{specOf(schema, f)?.label ?? f}</span>
          <span className="gb-track"><span className="gb-fill" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="gb-num">{v.toFixed(3)}</span>
        </div>
      ))}
    </div>
  )
}
