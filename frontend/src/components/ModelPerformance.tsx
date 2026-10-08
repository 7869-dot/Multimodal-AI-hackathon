import { useState } from 'react'
import type { Metrics, Schema, Target } from '../api'
import { GlobalBars } from './Explanation'

const MODEL_COLORS: Record<string, string> = {
  logreg: '#60a5fa',
  random_forest: '#34d399',
  xgboost: '#f472b6',
}
const METRIC_LABELS: Record<string, string> = {
  roc_auc: 'ROC-AUC', accuracy: 'Accuracy', precision: 'Precision', recall: 'Recall', f1: 'F1', brier: 'Brier ↓',
}

function Plot({ children, xLabel, yLabel }: { children: React.ReactNode; xLabel: string; yLabel: string }) {
  return (
    <svg viewBox="-34 -8 240 236" className="plot">
      <rect x="0" y="0" width="200" height="200" className="plot-bg" />
      {[0.25, 0.5, 0.75].map((t) => (
        <g key={t}>
          <line x1={t * 200} x2={t * 200} y1={0} y2={200} className="grid" />
          <line y1={t * 200} y2={t * 200} x1={0} x2={200} className="grid" />
        </g>
      ))}
      <line x1="0" y1="200" x2="200" y2="0" className="diag" />
      {children}
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <text x={t * 200} y={213} className="tick" textAnchor="middle">{t}</text>
          <text x={-6} y={200 - t * 200 + 3} className="tick" textAnchor="end">{t}</text>
        </g>
      ))}
      <text x="100" y="226" className="axis-label" textAnchor="middle">{xLabel}</text>
      <text x="-26" y="100" className="axis-label" textAnchor="middle" transform="rotate(-90 -26 100)">{yLabel}</text>
    </svg>
  )
}

const path = (xs: number[], ys: number[]) =>
  xs.map((x, i) => `${i ? 'L' : 'M'}${(x * 200).toFixed(1)},${(200 - ys[i] * 200).toFixed(1)}`).join(' ')

export default function ModelPerformance({ schema, metrics, importance, initial }: {
  schema: Schema
  metrics: Metrics
  importance: Record<string, Record<string, number>>
  initial: Target
}) {
  const [target, setTarget] = useState<Target>(initial)
  const m = metrics.metrics[target]
  const curves = metrics.curves[target]
  const sel = metrics.selected[target]
  const models = Object.keys(m)
  const cm = curves[sel].confusion

  return (
    <div className="perf">
      <div className="tabs small">
        {(Object.keys(metrics.metrics) as Target[]).map((t) => (
          <button type="button" key={t} className={t === target ? 'active' : ''} onClick={() => setTarget(t)}>
            {t === 'Cath' ? 'Overall CAD' : t}
          </button>
        ))}
      </div>
      <p className="muted small">
        {metrics.cv} on all {metrics.n} patients; prevalence {(metrics.prevalence[target] * 100).toFixed(0)}%.
        Each candidate is refit inside every fold (including its preprocessing), so scores are out-of-sample.
        Mean ± SD across the 50 folds; selected model in bold.
      </p>
      <div className="table-wrap">
        <table className="metrics">
          <thead>
            <tr><th>Model</th>{Object.keys(METRIC_LABELS).map((k) => <th key={k}>{METRIC_LABELS[k]}</th>)}</tr>
          </thead>
          <tbody>
            {models.map((name) => (
              <tr key={name} className={name === sel ? 'selected' : ''}>
                <td>
                  <span className="swatch" style={{ background: MODEL_COLORS[name] ?? '#64748b' }} />
                  {name === sel ? <b>{name}</b> : name}
                </td>
                {Object.keys(METRIC_LABELS).map((k) => (
                  <td key={k} className="num">
                    {m[name][k].mean.toFixed(3)}
                    <small> ±{m[name][k].std.toFixed(3)}</small>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="plots">
        <figure>
          <figcaption>ROC (out-of-fold)</figcaption>
          <Plot xLabel="False positive rate" yLabel="True positive rate">
            {Object.entries(curves).map(([name, c]) => (
              <path key={name} d={path(c.roc.fpr, c.roc.tpr)} stroke={MODEL_COLORS[name]} className={`curve ${name === sel ? 'sel' : ''}`} />
            ))}
          </Plot>
          <div className="legend tiny">
            {Object.entries(curves).map(([name, c]) => (
              <span key={name}><span className="swatch" style={{ background: MODEL_COLORS[name] }} />{name} {c.oof_auc.toFixed(3)}</span>
            ))}
          </div>
        </figure>
        <figure>
          <figcaption>Calibration ({sel})</figcaption>
          <Plot xLabel="Mean predicted probability" yLabel="Observed fraction">
            <path d={path(curves[sel].calibration.mean_predicted, curves[sel].calibration.fraction_positive)} stroke={MODEL_COLORS[sel]} className="curve sel" />
            {curves[sel].calibration.mean_predicted.map((x, i) => (
              <circle key={i} cx={x * 200} cy={200 - curves[sel].calibration.fraction_positive[i] * 200} r="3" fill={MODEL_COLORS[sel]} />
            ))}
          </Plot>
        </figure>
        <figure>
          <figcaption>Confusion matrix @ {metrics.threshold} ({sel})</figcaption>
          <div className="cm">
            <span />
            <span className="cm-h">Pred −</span>
            <span className="cm-h">Pred +</span>
            <span className="cm-h">True −</span>
            <span className="cm-cell good">{cm.tn}</span>
            <span className="cm-cell bad">{cm.fp}</span>
            <span className="cm-h">True +</span>
            <span className="cm-cell bad">{cm.fn}</span>
            <span className="cm-cell good">{cm.tp}</span>
          </div>
          <p className="tiny muted">Pooled out-of-fold predictions (averaged over repeats).</p>
        </figure>
      </div>
      <h4>Global feature importance — {schema.targets[target].label}</h4>
      <GlobalBars schema={schema} imp={importance[target]} n={12} />
    </div>
  )
}
