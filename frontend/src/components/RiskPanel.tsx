import { VESSELS, type Patient, type PredictResponse, type Schema, type Target } from '../api'
import { pct, riskBand, riskHex } from '../lib/color'

interface Props {
  schema: Schema
  prediction: PredictResponse | null
  selected: Target
  onSelect: (t: Target) => void
  patient: Patient | null
  modified: boolean
  cvAuc: Record<string, number>
}

function Gauge({ p }: { p: number }) {
  const r = 46
  const c = 2 * Math.PI * r
  const arc = 0.75 * c
  return (
    <svg viewBox="0 0 120 120" className="gauge" aria-label={`Overall CAD probability ${pct(p)}`}>
      <circle cx="60" cy="60" r={r} className="gauge-track" strokeDasharray={`${arc} ${c}`} transform="rotate(135 60 60)" />
      <circle
        cx="60" cy="60" r={r} className="gauge-fill" stroke={riskHex(p)}
        strokeDasharray={`${arc * p} ${c}`} transform="rotate(135 60 60)"
      />
      <text x="60" y="62" className="gauge-value">{pct(p)}</text>
      <text x="60" y="80" className="gauge-sub">P(CAD)</text>
    </svg>
  )
}

export default function RiskPanel({ schema, prediction, selected, onSelect, patient, modified, cvAuc }: Props) {
  const pr = prediction?.predictions
  const cad = pr?.Cath
  const showTruth = patient && !modified
  return (
    <div className="risk-panel">
      <button
        type="button"
        className={`cad-card ${selected === 'Cath' ? 'selected' : ''}`}
        onClick={() => onSelect('Cath')}
      >
        {cad ? <Gauge p={cad.probability} /> : <div className="gauge placeholder" />}
        <div className="cad-text">
          <div className="eyebrow">Overall coronary artery disease</div>
          <div className="cad-status" style={{ color: cad ? riskHex(cad.probability) : undefined }}>
            {cad ? (cad.positive ? 'CAD likely' : 'CAD unlikely') : '…'}
          </div>
          <div className="muted small">
            {cad && `${riskBand(cad.probability)} risk · threshold ${pct(schema.threshold)} · ${cad.model} (CV AUC ${cvAuc.Cath?.toFixed(2)})`}
          </div>
          {showTruth && (
            <div className="truth small">
              Dataset label: <b>{patient.labels.Cath ? 'CAD' : 'Normal'}</b> · out-of-fold estimate {pct(patient.oof_probability.Cath)}
            </div>
          )}
        </div>
      </button>
      <div className="vessel-list">
        {VESSELS.map((v) => {
          const p = pr?.[v]?.probability
          return (
            <button
              type="button" key={v}
              className={`vessel-row ${selected === v ? 'selected' : ''}`}
              onClick={() => onSelect(v)}
              title={schema.targets[v].description}
            >
              <span className="vessel-dot" style={{ background: p !== undefined ? riskHex(p) : '#8b8f98' }} />
              <span className="vessel-name">
                <b>{v}</b>
                <small>{schema.targets[v].label}</small>
              </span>
              <span className="bar">
                <span className="bar-fill" style={{ width: `${(p ?? 0) * 100}%`, background: p !== undefined ? riskHex(p) : undefined }} />
                <span className="bar-threshold" style={{ left: `${schema.threshold * 100}%` }} />
              </span>
              <span className="vessel-p">{p !== undefined ? pct(p) : '—'}</span>
              {showTruth && (
                <span className={`truth-chip ${patient.labels[v] ? 'pos' : 'neg'}`} title={`Out-of-fold estimate ${pct(patient.oof_probability[v])}`}>
                  {patient.labels[v] ? 'stenotic' : 'normal'}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {showTruth && (
        <p className="muted tiny">
          Dataset labels come from angiography. This patient was part of the training data, so the live probability is
          optimistic; the out-of-fold estimate (from cross-validation, when the patient was held out) is the honest one.
        </p>
      )}
    </div>
  )
}
