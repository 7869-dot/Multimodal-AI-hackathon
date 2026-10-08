import { useMemo, useState } from 'react'
import type { Schema, Target, TargetPrediction } from '../api'
import { formatValue, specOf } from '../lib/format'

interface Props {
  schema: Schema
  target: Target
  pred: TargetPrediction
}

/** Every measurement for the patient next to its normal range and its share of
 * the selected model's explanation (relative |SHAP|, signed). */
export default function PhysioTable({ schema, target, pred }: Props) {
  const [sort, setSort] = useState<'group' | 'impact'>('impact')
  const [abnormalOnly, setAbnormalOnly] = useState(false)
  const contribs = pred.explanation.contributions
  const total = contribs.reduce((s, c) => s + Math.abs(c.contribution), 0) || 1
  const maxAbs = Math.max(...contribs.map((c) => Math.abs(c.contribution))) || 1

  const rows = useMemo(() => {
    let r = contribs.map((c) => ({ ...c, spec: specOf(schema, c.feature), share: Math.abs(c.contribution) / total }))
    if (abnormalOnly) {
      r = r.filter((c) =>
        c.status === 'high' || c.status === 'low' ||
        (c.spec?.kind === 'binary' && Number(c.value) === 1) ||
        (c.spec?.kind === 'ordinal' && c.feature !== 'Sex' && Number(c.value) > 0) ||
        (c.feature === 'BBB' && c.value !== 'N'),
      )
    }
    if (sort === 'group') {
      const order = Object.keys(schema.groups)
      const idx = new Map(schema.features.map((f, i) => [f.name, i]))
      r.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || idx.get(a.feature)! - idx.get(b.feature)!)
    }
    return r
  }, [contribs, schema, sort, abnormalOnly, total])

  let lastGroup = ''
  return (
    <div className="physio">
      <div className="row between small">
        <span className="muted">Contribution to <b>{target === 'Cath' ? 'overall CAD' : `${target} stenosis`}</b> prediction</span>
        <span className="row">
          <label className="check"><input type="checkbox" checked={abnormalOnly} onChange={(e) => setAbnormalOnly(e.target.checked)} /> abnormal / present only</label>
          <select value={sort} onChange={(e) => setSort(e.target.value as 'group' | 'impact')} aria-label="Sort">
            <option value="impact">Sort by impact</option>
            <option value="group">Sort by system</option>
          </select>
        </span>
      </div>
      <table>
        <thead>
          <tr><th>Measurement</th><th>Value</th><th>Reference</th><th className="contrib-col">Contribution</th><th>Share</th></tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const header = sort === 'group' && c.group !== lastGroup
            lastGroup = c.group
            const w = (Math.abs(c.contribution) / maxAbs) * 50
            const up = c.contribution >= 0
            return [
              header && (
                <tr key={`h-${c.group}`} className="group-row"><td colSpan={5}>{schema.groups[c.group]}</td></tr>
              ),
              <tr key={c.feature}>
                <td>{c.label}</td>
                <td className={c.status === 'high' || c.status === 'low' ? 'abnormal' : ''}>
                  {formatValue(c.spec, c.value)}
                  {c.status === 'high' && <span className="flag">▲</span>}
                  {c.status === 'low' && <span className="flag">▼</span>}
                </td>
                <td className="muted">{c.spec?.normal ? `${c.spec.normal[0]}–${c.spec.normal[1]}` : ''}</td>
                <td className="contrib-col">
                  <span className="diverge">
                    <span className="axis" />
                    <span
                      className="dv-bar"
                      style={{ width: `${w}%`, left: up ? '50%' : `${50 - w}%`, background: up ? '#ef4444' : '#3b82f6' }}
                    />
                  </span>
                </td>
                <td className="num">{(c.share * 100).toFixed(1)}%</td>
              </tr>,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}
