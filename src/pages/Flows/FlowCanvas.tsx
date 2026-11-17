// The flow canvas: pan (drag the background or scroll), zoom (⌘/Ctrl + scroll, pinch, or the controls), drag steps around, click to select.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Icon } from '../../icons/Icon'
import { Avatar } from '../../components/Avatar'
import { Tooltip } from '../../components/Tooltip'
import { agentById, describeCondition, describeRoute, fieldById, fieldTypeIcon, isEnding, stepMeta } from './model'
import type { Graph, Issue, Step } from './model'

export const NODE_W = 280
const IN_Y = 24 // where edges enter a step: the middle of its header
const MIN_K = 0.3
const MAX_K = 1.75

export type View = { x: number; y: number; k: number }
export type CanvasApi = { fit: () => void; focus: (id: string) => void; zoomBy: (f: number) => void }
/** Where a new step goes: after an output that leads nowhere, or in the middle of an existing connection. */
export type AddTarget = { stepId: string; outId: string; insert: boolean }
export type Measure = { h: number; outs: Record<string, number> }

export type TestTrace = { active?: string; visited: Set<string>; taken: Set<string>; stuckOut?: string }

type Props = {
  graph: Graph
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
  onMoveEnd?: () => void
  onAdd: (t: AddTarget, at: { x: number; y: number }) => void
  pendingAdd?: AddTarget | null
  issues: Issue[]
  showErrors: boolean
  trace?: TestTrace
  measures: Record<string, Measure>
  onMeasure: (id: string, m: Measure) => void
  apiRef: RefObject<CanvasApi | null>
}

export function FlowCanvas({ graph, selectedId, onSelect, onMove, onMoveEnd, onAdd, pendingAdd, issues, showErrors, trace, measures, onMeasure, apiRef }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 80, y: 120, k: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [dragging, setDragging] = useState<'pan' | 'node' | null>(null)

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
    if (!el || graph.steps.length === 0) return
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const s of graph.steps) {
      const h = measures[s.id]?.h ?? 120
      x1 = Math.min(x1, s.x); y1 = Math.min(y1, s.y); x2 = Math.max(x2, s.x + NODE_W + (s.outs.some((o) => !o.to) ? 180 : 0)); y2 = Math.max(y2, s.y + h)
    }
    const pad = 64
    const k = Math.min(1, Math.max(MIN_K, Math.min((el.clientWidth - pad * 2) / (x2 - x1), (el.clientHeight - pad * 2) / (y2 - y1))))
    setView({ k, x: (el.clientWidth - (x2 - x1) * k) / 2 - x1 * k, y: (el.clientHeight - (y2 - y1) * k) / 2 - y1 * k })
  }, [graph.steps, measures])
  const focus = useCallback((id: string) => {
    const el = wrap.current
    const s = graph.steps.find((x) => x.id === id)
    if (!el || !s) return
    const k = Math.max(viewRef.current.k, 0.9)
    const h = measures[id]?.h ?? 120
    setView({ k, x: el.clientWidth / 2 - (s.x + NODE_W / 2) * k, y: el.clientHeight / 2 - (s.y + h / 2) * k })
  }, [graph.steps, measures])
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

  // ----- pointer: pan the background, drag a step -----
  const startPan = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    const sx = e.clientX, sy = e.clientY, v0 = viewRef.current
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return
      moved = true
      setDragging('pan')
      setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setDragging(null)
      if (!moved) onSelect(null)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const startDrag = (e: React.PointerEvent, s: Step) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, textarea')) return
    e.stopPropagation()
    const sx = e.clientX, sy = e.clientY, x0 = s.x, y0 = s.y
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return
      moved = true
      setDragging('node')
      const k = viewRef.current.k
      onMove(s.id, Math.round(x0 + (ev.clientX - sx) / k), Math.round(y0 + (ev.clientY - sy) / k))
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setDragging(null)
      if (moved) onMoveEnd?.()
      else onSelect(s.id)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const addAt = (t: AddTarget, e: React.MouseEvent) => {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    onAdd(t, { x: r.left + r.width / 2, y: r.bottom })
  }

  // ----- edges -----
  const byId = useMemo(() => Object.fromEntries(graph.steps.map((s) => [s.id, s])), [graph.steps])
  const edges: { key: string; d: string; mid: { x: number; y: number }; taken: boolean; t: AddTarget; to: Step }[] = []
  const ghosts: { key: string; x: number; y: number; px: number; py: number; t: AddTarget; stuck: boolean; label: string }[] = []
  for (const s of graph.steps) {
    const m = measures[s.id]
    if (!m) continue
    for (const o of s.outs) {
      const oy = m.outs[o.id]
      if (oy == null) continue
      const x1 = s.x + NODE_W, y1 = s.y + oy
      if (o.to && byId[o.to]) {
        const t = byId[o.to]
        const x2 = t.x, y2 = t.y + IN_Y
        const dx = Math.max(48, Math.abs(x2 - x1) / 2)
        edges.push({
          key: o.id, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2 - 6} ${y2}`, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
          taken: !!trace?.taken.has(o.id), t: { stepId: s.id, outId: o.id, insert: true }, to: t,
        })
      } else {
        ghosts.push({ key: o.id, px: x1, py: y1, x: x1 + 44, y: y1, t: { stepId: s.id, outId: o.id, insert: false }, stuck: trace?.stuckOut === o.id, label: o.label })
      }
    }
  }

  const grid = 20 * view.k
  return (
    <div
      ref={wrap}
      className={`fb-canvas${dragging ? ` is-${dragging}` : ''}${showErrors ? ' show-errors' : ''}`}
      style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={startPan}
    >
      <div className="fb-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="fb-edges" width="1" height="1" aria-hidden="true">
          {edges.map((e) => (
            <g key={e.key} className={`fb-edge${e.taken ? ' is-taken' : ''}`}>
              <path d={e.d} className="fb-edge__line" />
              <path d={`M ${e.to.x - 9} ${e.to.y + IN_Y - 5} L ${e.to.x - 3} ${e.to.y + IN_Y} L ${e.to.x - 9} ${e.to.y + IN_Y + 5}`} className="fb-edge__arrow" />
            </g>
          ))}
          {ghosts.map((g) => <path key={g.key} d={`M ${g.px} ${g.py} L ${g.x} ${g.y}`} className={`fb-ghost-line${g.stuck ? ' is-stuck' : ''}`} />)}
        </svg>

        {edges.map((e) => (
          <button
            key={`p${e.key}`} type="button" className={`fb-edge-add${pendingAdd?.outId === e.t.outId ? ' is-open' : ''}`} style={{ left: e.mid.x, top: e.mid.y }}
            aria-label="Insert a step here" title={isEnding(e.to.type) ? 'Insert a step before this ending' : 'Insert a step here'}
            onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => addAt(e.t, ev)}
          >
            <Icon name="add" size={14} />
          </button>
        ))}

        {ghosts.map((g) => (
          <button
            key={`g${g.key}`} type="button"
            className={`fb-ghost${pendingAdd?.outId === g.t.outId ? ' is-open' : ''}${g.stuck ? ' is-stuck' : ''}`}
            style={{ left: g.x, top: g.y }}
            onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => addAt(g.t, ev)}
          >
            <Icon name="add" size={14} />
            <span className="fb-ghost__ok">Add next step</span>
            <span className="fb-ghost__err">Leads nowhere · add a step</span>
          </button>
        ))}

        {graph.steps.map((s) => (
          <StepCard
            key={s.id} step={s} selected={selectedId === s.id} errors={errorsByStep[s.id] ?? 0} warning={warnByStep.has(s.id)}
            active={trace?.active === s.id} visited={!!trace?.visited.has(s.id)} dimmed={!!trace && !trace.visited.has(s.id)}
            onPointerDown={(e) => startDrag(e, s)} onMeasure={onMeasure}
          />
        ))}
      </div>

      <div className="fb-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <Tooltip content="Zoom in" placement="right" portal><button type="button" aria-label="Zoom in" onClick={() => apiRef.current?.zoomBy(1.2)}><Icon name="add" size={16} /></button></Tooltip>
        <span className="fb-zoom__pct">{Math.round(view.k * 100)}%</span>
        <Tooltip content="Zoom out" placement="right" portal><button type="button" aria-label="Zoom out" onClick={() => apiRef.current?.zoomBy(1 / 1.2)}><span className="fb-zoom__minus" /></button></Tooltip>
        <Tooltip content="Fit the whole flow" placement="right" portal><button type="button" aria-label="Fit to screen" onClick={fit}><Icon name="expand" size={16} /></button></Tooltip>
      </div>
      <div className="fb-hint">Drag to pan · Scroll to move · ⌘/Ctrl + scroll to zoom · Drag a step to move it</div>
    </div>
  )
}

// ---------- one step on the canvas ----------

type CardProps = {
  step: Step; selected: boolean; errors: number; warning: boolean; active: boolean; visited: boolean; dimmed: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onMeasure: (id: string, m: Measure) => void
}

function StepCard({ step: s, selected, errors, warning, active, visited, dimmed, onPointerDown, onMeasure }: CardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef('')
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const outs: Record<string, number> = {}
      el.querySelectorAll<HTMLElement>('[data-out]').forEach((p) => { outs[p.dataset.out!] = p.offsetTop + p.offsetHeight / 2 })
      const m = { h: el.offsetHeight, outs }
      const key = JSON.stringify(m)
      if (key !== last.current) { last.current = key; onMeasure(s.id, m) }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  })

  const meta = stepMeta[s.type]
  const d = s.data
  const cls = ['fb-step', `fb-step--${s.type}`, `tone-${meta.tone}`, selected && 'is-selected', errors > 0 && 'has-error', active && 'is-active', visited && 'is-visited', dimmed && 'is-dimmed'].filter(Boolean).join(' ')

  if (s.type === 'start') {
    return (
      <div ref={ref} className={cls} style={{ left: s.x, top: s.y, width: NODE_W }} onPointerDown={onPointerDown}>
        <div className="fb-step__head">
          <span className="fb-chip"><Icon name="chatinbox" size={14} /></span>
          <span className="fb-step__titles"><span className="fb-step__title">Visitor opens chat</span><span className="fb-step__kind">After the pre-chat form</span></span>
          {errors > 0 && <span className="fb-step__badge">{errors}</span>}
        </div>
        <div className="fb-ports">{s.outs.map((o) => <div key={o.id} data-out={o.id} className={`fb-port${o.to ? '' : ' is-empty'}`}><span className="fb-port__label">Start the flow</span><span className="fb-port__dot" /></div>)}</div>
      </div>
    )
  }

  const field = fieldById(d.saveTo)
  return (
    <div ref={ref} className={cls} style={{ left: s.x, top: s.y, width: NODE_W }} onPointerDown={onPointerDown}>
      <span className="fb-step__in" />
      <div className="fb-step__head">
        <span className="fb-chip"><Icon name={meta.icon} size={14} /></span>
        <span className="fb-step__titles"><span className="fb-step__kind">{meta.label}</span></span>
        {errors > 0 ? (
          <Tooltip content={`${errors} ${errors === 1 ? 'thing needs' : 'things need'} fixing`} portal><span className="fb-step__badge">{errors}</span></Tooltip>
        ) : warning ? <Tooltip content="Check the saved field" portal><span className="fb-step__warn"><Icon name="alerttriangle" size={14} /></span></Tooltip> : null}
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
        {field && (s.type === 'buttons' || s.type === 'question') && (
          <div className="fb-meta"><Icon name="save" size={14} /><span>Saves to <b>{field.label}</b></span></div>
        )}
      </div>
      {s.outs.length > 0 && (
        <div className="fb-ports">
          {s.outs.map((o, i) => (
            <div key={o.id} data-out={o.id} className={`fb-port${o.to ? '' : ' is-empty'}${o.fallback ? ' is-fallback' : ''}`}>
              <span className="fb-port__label">
                {s.type === 'condition' ? (i === 0 ? <><b>True</b> · {describeCondition(d)}</> : <b>Otherwise</b>)
                  : s.type === 'buttons' ? (o.label.trim() || <i>Untitled button</i>)
                  : s.type === 'question' ? 'After the answer' : 'Then'}
              </span>
              <span className="fb-port__dot" />
            </div>
          ))}
        </div>
      )}
      {meta.ending && <div className="fb-step__end"><Icon name="tick" size={14} />Ends this branch</div>}
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
