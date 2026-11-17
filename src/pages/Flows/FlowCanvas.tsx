// The flow canvas as an auto-laid-out tree, top to bottom (like Klaviyo, Pipedrive, HoneyBook).
// Steps can't be dragged: they always sit in their place in the tree. Pan by dragging the background or scrolling;
// zoom with ⌘/Ctrl + scroll, a pinch, or the controls. Branches split under a step, each with its label on the line.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Icon } from '../../icons/Icon'
import { Avatar } from '../../components/Avatar'
import { Tooltip } from '../../components/Tooltip'
import { agentById, describeCondition, describeRoute, fieldById, fieldTypeIcon, isEnding, stepById, stepMeta } from './model'
import type { Graph, Issue, Step } from './model'

export const NODE_W = 280
const GAP_X = 40 // between sibling branches
const SINGLE_GAP = 64 // from a step to the one after it
const BUS = 28 // from a step's bottom to the line its branches split from
const CHIP = 30 // from the split line to the middle of a branch label
const AFTER_CHIP = 72 // from the middle of a branch label to the next step
const MIN_K = 0.3
const MAX_K = 1.5

export type View = { x: number; y: number; k: number }
export type CanvasApi = { fit: () => void; focus: (id: string) => void; zoomBy: (f: number) => void }
/** Where a new step goes: after an output that leads nowhere, or in the middle of an existing connection. */
export type AddTarget = { stepId: string; outId: string; insert: boolean }
export type TestTrace = { active?: string; visited: Set<string>; taken: Set<string>; stuckOut?: string }

type Pt = { x: number; y: number }
type Layout = {
  pos: Record<string, Pt & { h: number }>
  links: { outId: string; d: string; arrow: Pt | null }[]
  chips: (Pt & { outId: string; label: string; kind: 'option' | 'fallback' | 'true' | 'otherwise'; empty: boolean })[]
  inserts: (Pt & { t: AddTarget; beforeEnding: boolean })[]
  ghosts: (Pt & { t: AddTarget; outId: string })[]
  ends: (Pt & { id: string })[]
  box: { x1: number; y1: number; x2: number; y2: number }
}

/** Places every step: each one centred over the branches below it. */
function layoutTree(g: Graph, heights: Record<string, number>): Layout {
  const L: Layout = { pos: {}, links: [], chips: [], inserts: [], ghosts: [], ends: [], box: { x1: 0, y1: 0, x2: NODE_W, y2: 0 } }
  const H = (id: string) => heights[id] ?? 110
  const memo: Record<string, number> = {}
  const width = (id: string): number => {
    if (memo[id] != null) return memo[id]
    const s = stepById(g, id)!
    const cols = s.outs.map((o) => (o.to && stepById(g, o.to) ? width(o.to) : NODE_W))
    const w = s.outs.length <= 1 ? Math.max(NODE_W, cols[0] ?? NODE_W) : Math.max(NODE_W, cols.reduce((a, b) => a + b, 0) + GAP_X * (cols.length - 1))
    return (memo[id] = w)
  }
  const grow = (x1: number, y1: number, x2: number, y2: number) => {
    L.box = { x1: Math.min(L.box.x1, x1), y1: Math.min(L.box.y1, y1), x2: Math.max(L.box.x2, x2), y2: Math.max(L.box.y2, y2) }
  }
  // A line that goes down, turns along the split line, and drops into its branch, with rounded corners.
  const elbow = (cx: number, top: number, busY: number, ccx: number, end: number) => {
    if (Math.abs(ccx - cx) < 1) return `M ${cx} ${top} L ${cx} ${end}`
    const r = 12, dir = ccx > cx ? 1 : -1
    return `M ${cx} ${top} L ${cx} ${busY - r} Q ${cx} ${busY} ${cx + dir * r} ${busY} L ${ccx - dir * r} ${busY} Q ${ccx} ${busY} ${ccx} ${busY + r} L ${ccx} ${end}`
  }

  const place = (id: string, left: number, top: number) => {
    const s = stepById(g, id)!
    const w = width(id), h = H(id), cx = left + w / 2, bottom = top + h
    L.pos[id] = { x: cx - NODE_W / 2, y: top, h }
    grow(cx - NODE_W / 2, top, cx + NODE_W / 2, bottom)
    if (s.outs.length === 0) {
      L.ends.push({ id, x: cx, y: bottom + 22 })
      grow(cx - 60, bottom, cx + 60, bottom + 40)
      return
    }
    if (s.outs.length === 1) {
      const o = s.outs[0]
      const child = o.to && stepById(g, o.to)
      if (child) {
        const childTop = bottom + SINGLE_GAP
        L.links.push({ outId: o.id, d: `M ${cx} ${bottom} L ${cx} ${childTop - 2}`, arrow: { x: cx, y: childTop } })
        L.inserts.push({ x: cx, y: bottom + SINGLE_GAP / 2, t: { stepId: s.id, outId: o.id, insert: true }, beforeEnding: isEnding(child.type) })
        place(child.id, left, childTop)
      } else {
        L.links.push({ outId: o.id, d: `M ${cx} ${bottom} L ${cx} ${bottom + 26}`, arrow: null })
        L.ghosts.push({ x: cx, y: bottom + 44, t: { stepId: s.id, outId: o.id, insert: false }, outId: o.id })
        grow(cx - 110, bottom, cx + 110, bottom + 64)
      }
      return
    }
    // Several branches: they split from one line, each with its label.
    const cols = s.outs.map((o) => (o.to && stepById(g, o.to) ? width(o.to) : NODE_W))
    const total = cols.reduce((a, b) => a + b, 0) + GAP_X * (cols.length - 1)
    let colLeft = left + (w - total) / 2
    const busY = bottom + BUS, chipY = busY + CHIP
    s.outs.forEach((o, i) => {
      const ccx = colLeft + cols[i] / 2
      const child = o.to && stepById(g, o.to)
      const kind = s.type === 'condition' ? (i === 0 ? 'true' : 'otherwise') : o.fallback ? 'fallback' : 'option'
      const label = s.type === 'condition' ? (i === 0 ? 'True' : 'Otherwise') : o.label.trim() || 'Untitled button'
      L.chips.push({ x: ccx, y: chipY, outId: o.id, label, kind, empty: !child })
      if (child) {
        const childTop = chipY + AFTER_CHIP
        L.links.push({ outId: o.id, d: elbow(cx, bottom, busY, ccx, childTop - 2), arrow: { x: ccx, y: childTop } })
        L.inserts.push({ x: ccx, y: chipY + AFTER_CHIP / 2 + 4, t: { stepId: s.id, outId: o.id, insert: true }, beforeEnding: isEnding(child.type) })
        place(child.id, colLeft, childTop)
      } else {
        L.links.push({ outId: o.id, d: elbow(cx, bottom, busY, ccx, chipY + 40), arrow: null })
        L.ghosts.push({ x: ccx, y: chipY + 58, t: { stepId: s.id, outId: o.id, insert: false }, outId: o.id })
        grow(ccx - 110, chipY, ccx + 110, chipY + 80)
      }
      colLeft += cols[i] + GAP_X
    })
  }
  const start = g.steps.find((s) => s.type === 'start')
  if (start) place(start.id, 0, 0)
  return L
}

type Props = {
  graph: Graph
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: (t: AddTarget, at: { x: number; y: number }) => void
  pendingAdd?: AddTarget | null
  issues: Issue[]
  showErrors: boolean
  trace?: TestTrace
  heights: Record<string, number>
  onMeasure: (id: string, h: number) => void
  apiRef: RefObject<CanvasApi | null>
}

export function FlowCanvas({ graph, selectedId, onSelect, onAdd, pendingAdd, issues, showErrors, trace, heights, onMeasure, apiRef }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 40, k: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [panning, setPanning] = useState(false)
  const L = useMemo(() => layoutTree(graph, heights), [graph, heights])

  const errorsByStep = useMemo(() => {
    const m: Record<string, number> = {}
    for (const i of issues) if (i.severity === 'error') m[i.stepId] = (m[i.stepId] ?? 0) + 1
    return m
  }, [issues])
  const warnByStep = useMemo(() => new Set(issues.filter((i) => i.severity === 'warning').map((i) => i.stepId)), [issues])

  // ----- view controls -----
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor))
      const f = k / v.k
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }
    })
  }, [])
  const fit = useCallback(() => {
    const el = wrap.current
    if (!el) return
    const { x1, y1, x2, y2 } = L.box
    const pad = 56
    const k = Math.min(1, Math.max(MIN_K, Math.min((el.clientWidth - pad * 2) / (x2 - x1), (el.clientHeight - pad * 2) / (y2 - y1))))
    // Wide flows: fit the width and start at the top. Short ones: centre them.
    const y = (y2 - y1) * k < el.clientHeight - pad * 2 ? (el.clientHeight - (y2 - y1) * k) / 2 - y1 * k : pad - y1 * k
    setView({ k, x: (el.clientWidth - (x2 - x1) * k) / 2 - x1 * k, y })
  }, [L.box])
  const focus = useCallback((id: string) => {
    const el = wrap.current
    const p = L.pos[id]
    if (!el || !p) return
    const k = Math.max(viewRef.current.k, 0.85)
    setView({ k, x: el.clientWidth / 2 - (p.x + NODE_W / 2) * k, y: el.clientHeight / 3 - (p.y + p.h / 2) * k })
  }, [L.pos])
  useEffect(() => {
    apiRef.current = { fit, focus, zoomBy: (f) => { const el = wrap.current; if (el) zoomAt(f, el.clientWidth / 2, el.clientHeight / 2) } }
  }, [apiRef, fit, focus, zoomAt])

  // Scroll pans, ⌘/Ctrl + scroll (and trackpad pinch) zooms towards the pointer.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.fb-scrollable')) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // Dragging anywhere (except a button) pans; a click without moving selects the step under it, or clears the selection.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    if ((e.target as HTMLElement).closest('button, input, textarea')) return
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-step]')
    const sx = e.clientX, sy = e.clientY, v0 = viewRef.current
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return
      moved = true
      setPanning(true)
      setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setPanning(false)
      if (!moved) onSelect(card?.dataset.step ?? null)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const addAt = (t: AddTarget, e: React.MouseEvent) => {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    onAdd(t, { x: r.left + r.width / 2, y: r.bottom })
  }

  // Taken (test) paths draw last so they sit on top of shared trunk lines.
  const links = [...L.links].sort((a, b) => Number(!!trace?.taken.has(a.outId)) - Number(!!trace?.taken.has(b.outId)))
  const grid = 20 * view.k

  return (
    <div
      ref={wrap}
      className={`fb-canvas${panning ? ' is-pan' : ''}${showErrors ? ' show-errors' : ''}`}
      style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={onPointerDown}
    >
      <div className="fb-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="fb-edges" width="1" height="1" aria-hidden="true">
          {links.map((l) => {
            const taken = !!trace?.taken.has(l.outId)
            const stuck = trace?.stuckOut === l.outId
            const empty = !l.arrow
            return (
              <g key={l.outId} className={`fb-edge${taken ? ' is-taken' : ''}${empty ? ' is-empty' : ''}${stuck ? ' is-stuck' : ''}`}>
                <path d={l.d} className="fb-edge__line" />
                {l.arrow && <path d={`M ${l.arrow.x - 5} ${l.arrow.y - 8} L ${l.arrow.x} ${l.arrow.y - 2} L ${l.arrow.x + 5} ${l.arrow.y - 8}`} className="fb-edge__arrow" />}
              </g>
            )
          })}
        </svg>

        {L.chips.map((c) => (
          <span key={`c${c.outId}`} className={`fb-branch is-${c.kind}${c.empty ? ' is-empty' : ''}${trace?.taken.has(c.outId) ? ' is-taken' : ''}`} style={{ left: c.x, top: c.y }} title={c.label}>
            {c.kind === 'fallback' && <Icon name="text" size={14} />}
            {c.label}
          </span>
        ))}

        {L.inserts.map((p) => (
          <button
            key={`p${p.t.outId}`} type="button" className={`fb-edge-add${pendingAdd?.outId === p.t.outId && pendingAdd.insert ? ' is-open' : ''}`}
            style={{ left: p.x, top: p.y }} aria-label="Insert a step here" title={p.beforeEnding ? 'Insert a step before this ending' : 'Insert a step here'}
            onClick={(ev) => addAt(p.t, ev)}
          >
            <Icon name="add" size={14} />
          </button>
        ))}

        {L.ghosts.map((g) => (
          <button
            key={`g${g.outId}`} type="button"
            className={`fb-ghost${pendingAdd?.outId === g.outId && !pendingAdd.insert ? ' is-open' : ''}${trace?.stuckOut === g.outId ? ' is-stuck' : ''}`}
            style={{ left: g.x, top: g.y }} onClick={(ev) => addAt(g.t, ev)}
          >
            <Icon name="add" size={14} />
            <span className="fb-ghost__ok">Add step</span>
            <span className="fb-ghost__err">Leads nowhere · add a step</span>
          </button>
        ))}

        {L.ends.map((e) => (
          <span key={`e${e.id}`} className={`fb-end${trace?.active === e.id ? ' is-reached' : ''}`} style={{ left: e.x, top: e.y }}><Icon name="tick" size={14} />End</span>
        ))}

        {graph.steps.map((s) => {
          const p = L.pos[s.id]
          if (!p) return null
          return (
            <StepCard
              key={s.id} step={s} x={p.x} y={p.y} selected={selectedId === s.id} errors={errorsByStep[s.id] ?? 0} warning={warnByStep.has(s.id)}
              active={trace?.active === s.id} visited={!!trace?.visited.has(s.id)} dimmed={!!trace && !trace.visited.has(s.id)}
              onMeasure={onMeasure}
            />
          )
        })}
      </div>

      <div className="fb-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <Tooltip content="Zoom in" placement="right" portal><button type="button" aria-label="Zoom in" onClick={() => apiRef.current?.zoomBy(1.2)}><Icon name="add" size={16} /></button></Tooltip>
        <span className="fb-zoom__pct">{Math.round(view.k * 100)}%</span>
        <Tooltip content="Zoom out" placement="right" portal><button type="button" aria-label="Zoom out" onClick={() => apiRef.current?.zoomBy(1 / 1.2)}><span className="fb-zoom__minus" /></button></Tooltip>
        <Tooltip content="Fit the whole flow" placement="right" portal><button type="button" aria-label="Fit to screen" onClick={fit}><Icon name="expand" size={16} /></button></Tooltip>
      </div>
      <div className="fb-hint">Drag or scroll to move around · ⌘/Ctrl + scroll to zoom · Click a step to edit it</div>
    </div>
  )
}

// ---------- one step ----------

type CardProps = {
  step: Step; x: number; y: number; selected: boolean; errors: number; warning: boolean; active: boolean; visited: boolean; dimmed: boolean
  onMeasure: (id: string, h: number) => void
}

function StepCard({ step: s, x, y, selected, errors, warning, active, visited, dimmed, onMeasure }: CardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef(-1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => { const h = el.offsetHeight; if (h !== last.current) { last.current = h; onMeasure(s.id, h) } }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [s.id, onMeasure])

  const meta = stepMeta[s.type]
  const d = s.data
  const cls = ['fb-step', `fb-step--${s.type}`, `tone-${meta.tone}`, selected && 'is-selected', errors > 0 && 'has-error', active && 'is-active', visited && 'is-visited', dimmed && 'is-dimmed'].filter(Boolean).join(' ')
  const badge = errors > 0
    ? <Tooltip content={`${errors} ${errors === 1 ? 'thing needs' : 'things need'} fixing`} portal><span className="fb-step__badge">{errors}</span></Tooltip>
    : warning ? <Tooltip content="Check the saved field" portal><span className="fb-step__warn"><Icon name="alerttriangle" size={14} /></span></Tooltip> : null

  if (s.type === 'start') {
    return (
      <div ref={ref} data-step={s.id} className={cls} style={{ left: x, top: y, width: NODE_W }}>
        <div className="fb-step__head">
          <span className="fb-chip"><Icon name="chatinbox" size={14} /></span>
          <span className="fb-step__titles"><span className="fb-step__title">Visitor opens chat</span><span className="fb-step__kind">After the pre-chat form</span></span>
          {badge}
        </div>
      </div>
    )
  }

  const field = fieldById(d.saveTo)
  const buttons = s.type === 'buttons' ? s.outs.filter((o) => !o.fallback).length : 0
  return (
    <div ref={ref} data-step={s.id} className={cls} style={{ left: x, top: y, width: NODE_W }}>
      <div className="fb-step__head">
        <span className="fb-chip"><Icon name={meta.icon} size={14} /></span>
        <span className="fb-step__titles"><span className="fb-step__kind">{meta.label}</span></span>
        {badge}
      </div>
      <div className="fb-step__body">
        {(s.type === 'message' || s.type === 'buttons' || s.type === 'question') && (
          d.text?.trim() ? <div className="fb-bubble">{d.text}</div> : <div className="fb-bubble is-empty">{s.type === 'message' ? 'Write a message…' : 'Write a question…'}</div>
        )}
        {s.type === 'condition' && (
          <div className={`fb-rule${d.field ? '' : ' is-empty'}`}>
            {d.field ? <><Icon name={fieldTypeIcon[fieldById(d.field)!.type]} size={14} /><span>{describeCondition(d)}</span></> : 'Pick a field to check…'}
          </div>
        )}
        {s.type === 'aiAgent' && (
          <>
            <div className="fb-line">Answers with the flow’s answers as context</div>
            <div className="fb-meta"><Icon name="moveright" size={14} /><span>If it hands over: <b>{describeRoute(d.mode, d.agents)}</b></span></div>
          </>
        )}
        {s.type === 'assign' && <RouteSummary mode={d.mode} ids={d.agents ?? []} />}
        {s.type === 'end' && <div className="fb-line">{d.text?.trim() ? `“${d.text}”` : 'Closes the chat'}</div>}
        {s.type === 'buttons' && <div className="fb-meta"><Icon name="listview" size={14} /><span>{buttons} buttons{s.outs.some((o) => o.fallback) ? ' + Anything else' : ''}</span></div>}
        {s.type === 'question' && <div className="fb-meta"><Icon name="text" size={14} /><span>Waits for a typed answer</span></div>}
        {field && (s.type === 'buttons' || s.type === 'question') && (
          <div className="fb-meta"><Icon name="save" size={14} /><span>Saves to <b>{field.label}</b></span></div>
        )}
      </div>
    </div>
  )
}

function RouteSummary({ mode, ids }: { mode?: string; ids: string[] }) {
  const list = ids.map(agentById).filter(Boolean)
  if (list.length === 0) return <div className="fb-line is-empty">{mode === 'one' ? 'Pick an agent…' : 'Pick agents for the round robin…'}</div>
  return (
    <div className="fb-route">
      <span className="fb-route__avatars">{list.slice(0, 4).map((a) => <Avatar key={a!.id} initial={a!.initial} color={a!.color} size="small" />)}</span>
      <span>{mode === 'one' ? list[0]!.name : `Round robin · ${list.length} agent${list.length > 1 ? 's' : ''}`}</span>
    </div>
  )
}
