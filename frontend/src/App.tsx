import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api, VESSELS, type Features, type Metrics, type Patient, type PatientSummary, type PredictResponse,
  type Schema, type Target, type Vessel,
} from './api'
import { CORONARY_TREE, VIEWS } from './anatomy/anatomy'
import Explanation from './components/Explanation'
import type { HoverInfo, LabelRefs, SceneOptions } from './components/HeartScene'
import ModelPerformance from './components/ModelPerformance'
import PatientForm from './components/PatientForm'
import PhysioTable from './components/PhysioTable'
import RiskPanel from './components/RiskPanel'
import { pct, riskBand, riskHex, RISK_GRADIENT_CSS } from './lib/color'

const HeartScene = lazy(() => import('./components/HeartScene'))

type Tab = 'explain' | 'physio' | 'model'

function defaults(schema: Schema): Features {
  return Object.fromEntries(schema.features.filter((f) => !f.derived).map((f) => [f.name, f.default]))
}

export default function App() {
  const [schema, setSchema] = useState<Schema | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [importance, setImportance] = useState<Record<string, Record<string, number>> | null>(null)
  const [patients, setPatients] = useState<PatientSummary[]>([])
  const [features, setFeatures] = useState<Features>({})
  const [patient, setPatient] = useState<Patient | null>(null)
  const [modified, setModified] = useState(false)
  const [prediction, setPrediction] = useState<PredictResponse | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Target>('Cath')
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [tab, setTab] = useState<Tab>('explain')
  const [options, setOptions] = useState<SceneOptions>({ territories: true, labels: true, torso: false, beat: true })
  const [view, setView] = useState({ name: 'Anterior', nonce: 0 })
  const labelRefs = useRef<LabelRefs>({})

  const loadPatient = useCallback(async (id: number) => {
    const p = await api.patient(id)
    setPatient(p)
    setModified(false)
    setFeatures(p.features)
  }, [])

  useEffect(() => {
    Promise.all([api.schema(), api.metrics(), api.importance(), api.patients()])
      .then(([s, m, imp, ps]) => {
        setSchema(s)
        setMetrics(m)
        setImportance(imp)
        setPatients(ps)
        setFeatures(defaults(s))
        // Open on a patient with a mixed vessel pattern so the 3D mapping is informative.
        const demo = ps.find((p) => p.labels.LAD && !p.labels.LCX && p.labels.RCA) ?? ps[0]
        if (demo) loadPatient(demo.id)
      })
      .catch((e) => setError(`Cannot reach the prediction API (${e.message}). Start it with: uvicorn cad.api:app, or check VITE_API_URL`))
  }, [loadPatient])

  // Live prediction: debounce edits, cancel stale requests.
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!schema || !Object.keys(features).length) return
    const timer = setTimeout(() => {
      ctrl.current?.abort()
      const c = new AbortController()
      ctrl.current = c
      const t0 = performance.now()
      api.predict(features, c.signal)
        .then((r) => {
          setPrediction(r)
          setLatency(Math.round(performance.now() - t0))
          setError(null)
        })
        .catch((e) => e.name !== 'AbortError' && setError(e.message))
    }, 120)
    return () => clearTimeout(timer)
  }, [features, schema])

  const onChange = useCallback((name: string, value: number | string) => {
    setFeatures((f) => ({ ...f, [name]: value }))
    setModified(true)
  }, [])

  const probs = useMemo(() => {
    if (!prediction) return null
    return Object.fromEntries(VESSELS.map((v) => [v, prediction.predictions[v].probability])) as Record<Vessel, number>
  }, [prediction])

  const cvAuc = useMemo(
    () => (metrics ? Object.fromEntries(Object.entries(metrics.selected).map(([t, m]) => [t, metrics.metrics[t][m].roc_auc.mean])) : {}),
    [metrics],
  )

  if (error && !schema) {
    return <div className="fatal"><h2>CardioVision</h2><p>{error}</p></div>
  }
  if (!schema) {
    return (
      <div className="fatal">
        <p>Loading models…<br /><small className="muted">A sleeping free-tier backend can take up to a minute to wake up.</small></p>
      </div>
    )
  }

  const selPred = prediction?.predictions[selected]
  const focus = hover?.vessel ?? (selected !== 'Cath' ? selected : null)
  const focusDef = focus ? CORONARY_TREE.find((d) => d.id === focus) : null
  const heartRate = Number(features.PR ?? 75)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#ef4444" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.6 4.5c2 0 3.4 1.1 4.2 2.4h2.4c.8-1.3 2.2-2.4 4.2-2.4 3.6 0 5.7 3.8 4.2 7.2C19.5 16.4 12 21 12 21z" /><path d="M3 12h4l2-3 3 6 2-3h7" stroke="#fff" strokeWidth="1.6" fill="none" /></svg>
          <span>CardioVision</span>
          <small>Coronary risk · 3D mapping · explainable AI</small>
        </div>
        <div className="status small">
          {error ? <span className="err">● {error}</span> : <span className="ok">● live model{latency !== null && ` · ${latency} ms`}</span>}
        </div>
      </header>
      <div className="disclaimer" role="note">
        <strong>⚠ Decision-support &amp; educational prototype.</strong> Predictions are statistical estimates from a
        303-patient research dataset. They are <u>not a diagnosis</u> and <u>not a substitute for coronary angiography,
        CT angiography or other formal diagnostic imaging</u>. Always defer to a qualified clinician.
      </div>

      <main className="layout">
        <aside className="panel left">
          <h3>Patient input</h3>
          <PatientForm
            schema={schema} features={features} derived={prediction?.derived ?? null} onChange={onChange}
            patients={patients} loadedId={modified ? null : patient?.id ?? null} onLoadPatient={loadPatient}
            onReset={() => { setFeatures(defaults(schema)); setPatient(null); setModified(true) }}
          />
        </aside>

        <section className="stage">
          <Suspense fallback={<div className="stage-loading">Loading 3D heart…</div>}>
            <HeartScene
              probs={probs} selected={selected} onSelect={setSelected} onHover={setHover}
              options={options} heartRate={heartRate} view={view} labelRefs={labelRefs}
            />
          </Suspense>
          {options.labels && (
            <div className="label-layer">
              {VESSELS.map((v) => (
                <button
                  type="button" key={v}
                  ref={(el) => { labelRefs.current[v] = el }}
                  className={`vessel-label ${selected === v ? 'selected' : ''}`}
                  style={{ borderColor: probs ? riskHex(probs[v]) : undefined }}
                  onClick={() => setSelected(v)}
                  onMouseEnter={() => setHover({ vessel: v, part: 'label' })}
                  onMouseLeave={() => setHover(null)}
                >
                  <b>{v}</b>
                  <span>{probs ? pct(probs[v]) : '—'}</span>
                </button>
              ))}
            </div>
          )}
          <div className="overlay top-left">
            <div className="views">
              {Object.keys(VIEWS).map((v) => (
                <button type="button" key={v} className={view.name === v ? 'active' : ''} onClick={() => setView({ name: v, nonce: view.nonce + 1 })}>{v}</button>
              ))}
            </div>
            <div className="toggles small">
              {(['territories', 'labels', 'torso', 'beat'] as const).map((k) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={options[k]} onChange={(e) => setOptions({ ...options, [k]: e.target.checked })} />
                  {{ territories: 'Perfusion territories', labels: 'Labels', torso: 'Torso context', beat: `Heartbeat (${heartRate} bpm)` }[k]}
                </label>
              ))}
            </div>
          </div>
          <div className="overlay top-right legend-card">
            <div className="tiny muted">Predicted stenosis probability</div>
            <div className="gradient" style={{ background: RISK_GRADIENT_CSS }} />
            <div className="row between tiny"><span>0%</span><span>50%</span><span>100%</span></div>
          </div>
          {focusDef && probs && (
            <div className="overlay bottom-left vessel-card" style={{ borderColor: riskHex(probs[focusDef.id]) }}>
              <div className="row between">
                <b>{focusDef.label} ({focusDef.id})</b>
                <span className="big" style={{ color: riskHex(probs[focusDef.id]) }}>{pct(probs[focusDef.id])}</span>
              </div>
              <div className="small">{riskBand(probs[focusDef.id])} probability of ≥50% stenosis{hover && ` · ${hover.part}`}</div>
              <div className="tiny muted">{focusDef.description}</div>
              <div className="tiny muted">
                Colour shows vessel-level probability. The dataset does not localise lesions within a vessel, so the whole
                vessel and its approximate perfusion territory are coloured.
              </div>
            </div>
          )}
          <div className="overlay bottom-right tiny muted hint">Drag to rotate · scroll to zoom · click a vessel or wall region</div>
        </section>

        <aside className="panel right">
          <RiskPanel
            schema={schema} prediction={prediction} selected={selected} onSelect={setSelected}
            patient={patient} modified={modified} cvAuc={cvAuc}
          />
          <div className="tabs">
            <button type="button" className={tab === 'explain' ? 'active' : ''} onClick={() => setTab('explain')}>Why this risk?</button>
            <button type="button" className={tab === 'physio' ? 'active' : ''} onClick={() => setTab('physio')}>Physiology</button>
            <button type="button" className={tab === 'model' ? 'active' : ''} onClick={() => setTab('model')}>Model performance</button>
          </div>
          <div className="tab-body">
            {tab !== 'model' && (
              <div className="target-title">
                Explaining: <b>{schema.targets[selected].label}</b>
                <span className="muted small"> (select a vessel on the heart or above)</span>
              </div>
            )}
            {tab === 'explain' && selPred && (
              <Explanation schema={schema} target={selected} pred={selPred} globalImportance={importance?.[selected]} />
            )}
            {tab === 'physio' && selPred && <PhysioTable schema={schema} target={selected} pred={selPred} />}
            {tab === 'model' && metrics && importance && (
              <ModelPerformance key={selected} schema={schema} metrics={metrics} importance={importance} initial={selected} />
            )}
          </div>
        </aside>
      </main>
      <footer className="footer tiny muted">
        Data: Extension of Z-Alizadeh Sani dataset (UCI ML Repository, n = 303). Anatomy: procedural model of the heart
        and coronary tree. Not for clinical use.
      </footer>
    </div>
  )
}
