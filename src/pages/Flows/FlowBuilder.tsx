// Full-screen flow builder: canvas in the middle, one right panel that shows the selected step, the issues list or the test chat.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../icons/Icon'
import { Button } from '../../components/Button'
import { Modal, ModalText } from '../../components/Modal'
import { Popover } from '../../components/Popover'
import { ListIcon, ListItem } from '../../components/List'
import { Tag } from '../../components/Tag'
import { Tooltip } from '../../components/Tooltip'
import { FlowCanvas } from './FlowCanvas'
import type { AddTarget, CanvasApi, TestTrace } from './FlowCanvas'
import { Inspector } from './Inspector'
import { TestPanel } from './TestPanel'
import { isEnding, newStep, removalCount, removeStep, sameGraph, stepById, stepMeta, stepTitle, subtree, updateStep, validate } from './model'
import type { Flow, Graph, Step, StepType } from './model'
import './FlowBuilder.css'

type Panel = 'step' | 'issues' | 'test' | null
type Banner = { tone: 'error' | 'success' | 'info'; text: string; action?: { label: string; run: () => void } } | null

type Props = {
  flow: Flow
  onDraft: (graph: Graph, name: string) => void
  onSave: (graph: Graph, name: string) => void
  onTurnOn: () => void
  onExit: () => void
}

export function FlowBuilder({ flow, onDraft, onSave, onTurnOn, onExit }: Props) {
  const [graph, setGraph] = useState<Graph>(flow.draft)
  const [name, setName] = useState(flow.name)
  const [editingName, setEditingName] = useState(false)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [picker, setPicker] = useState<{ target: AddTarget; at: { x: number; y: number } } | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)
  const [confirm, setConfirm] = useState<{ title: string; text: string; run: () => void } | null>(null)
  const [test, setTest] = useState<{ startAt: string | null; key: number }>({ startAt: null, key: 0 })
  const [trace, setTrace] = useState<TestTrace | undefined>()
  const [fitPending, setFitPending] = useState(true)
  const api = useRef<CanvasApi | null>(null)
  const pickerAnchor = useRef<HTMLDivElement>(null)
  const past = useRef<Graph[]>([])

  const issues = useMemo(() => validate(graph), [graph])
  const errors = issues.filter((i) => i.severity === 'error')
  const savedVersion = flow.saved
  const dirty = !sameGraph(graph, savedVersion) || name !== flow.name

  useEffect(() => { onDraft(graph, name) }, [graph, name]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the flow on screen once every card has been measured.
  useEffect(() => {
    if (fitPending && graph.steps.every((s) => heights[s.id])) { api.current?.fit(); setFitPending(false) }
  }, [fitPending, heights, graph.steps])
  // Once everything is fixed, the red highlighting can go.
  useEffect(() => { if (showErrors && errors.length === 0) { setShowErrors(false); setBanner({ tone: 'success', text: 'All branches end somewhere now. You can save the flow.' }) } }, [errors.length, showErrors])

  // ----- changes -----
  const commit = useCallback((fn: (g: Graph) => Graph) => {
    setGraph((g) => { past.current = [...past.current.slice(-49), g]; return fn(g) })
  }, [])
  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (prev) { setGraph(prev); setBanner({ tone: 'info', text: 'Undone' }) }
  }, [])
  const onMeasure = useCallback((id: string, h: number) => setHeights((x) => ({ ...x, [id]: h })), [])
  const select = (id: string | null) => {
    setSelected(id)
    setPicker(null)
    if (id) setPanel((p) => (p === 'test' ? 'test' : 'step'))
    else setPanel((p) => (p === 'step' ? null : p))
  }
  const goTo = (id: string) => { setSelected(id); setPanel('step'); api.current?.focus(id) }

  // The tree lays itself out, so a new step only needs wiring in: after an open output, or between two steps.
  const addStep = (type: StepType, t: AddTarget) => {
    const parent = stepById(graph, t.stepId)
    const out = parent?.outs.find((o) => o.id === t.outId)
    if (!parent || !out) return
    const created = newStep(type)
    if (t.insert && out.to && created.outs[0]) created.outs[0].to = out.to
    commit((g) => ({
      steps: [...g.steps.map((s) => (s.id === parent.id ? { ...s, outs: s.outs.map((o) => (o.id === out.id ? { ...o, to: created.id } : o)) } : s)), created],
    }))
    setPicker(null)
    setSelected(created.id)
    setPanel((p) => (p === 'test' ? 'test' : 'step'))
    requestAnimationFrame(() => requestAnimationFrame(() => api.current?.focus(created.id)))
  }

  const deleteStep = (id: string) => {
    const s = stepById(graph, id)
    if (!s || s.type === 'start') return
    const n = removalCount(graph, id)
    const run = () => {
      commit((g) => removeStep(g, id))
      setSelected(null); setPanel((p) => (p === 'step' ? null : p)); setConfirm(null)
      setBanner({ tone: 'info', text: n > 1 ? `Deleted ${n} steps` : 'Step deleted', action: { label: 'Undo', run: undo } })
    }
    if (n > 1) setConfirm({ title: 'Delete this branch?', text: `“${stepTitle(s)}” has ${n - 1} step${n > 2 ? 's' : ''} after it. They’ll be deleted too.`, run })
    else run()
  }

  const removeOut = (stepId: string, outId: string) => {
    const s = stepById(graph, stepId)
    const out = s?.outs.find((o) => o.id === outId)
    if (!s || !out) return
    const run = () => {
      commit((g) => {
        const gone = new Set(out.to ? subtree(g, out.to) : [])
        return { steps: g.steps.filter((x) => !gone.has(x.id)).map((x) => (x.id === stepId ? { ...x, outs: x.outs.filter((o) => o.id !== outId) } : x)) }
      })
      setConfirm(null)
    }
    if (out.to) {
      const n = subtree(graph, out.to).length
      setConfirm({ title: `Remove “${out.label || 'Untitled'}”?`, text: `Its branch has ${n} step${n > 1 ? 's' : ''}. They’ll be deleted too.`, run })
    } else run()
  }

  const save = () => {
    if (errors.length > 0) {
      setShowErrors(true)
      setPanel('issues')
      setSelected(null)
      setBanner({ tone: 'error', text: `Can’t save yet: ${errors.length} ${errors.length === 1 ? 'thing needs' : 'things need'} fixing. Every button and branch has to end in an AI agent, Assign or End chat step.` })
      return
    }
    onSave(graph, name)
    setBanner(flow.live
      ? { tone: 'success', text: 'Saved. New chats get this version; chats already in the flow finish on the old one.' }
      : { tone: 'success', text: 'Saved. The flow is off, so visitors don’t see it yet.', action: { label: 'Turn on for Chat-Support', run: () => { onTurnOn(); setBanner({ tone: 'success', text: 'The flow is on. Chats that start from now get it.' }) } } })
  }

  const startTest = (startAt: string | null) => {
    setPanel('test')
    setTest((t) => ({ startAt, key: t.key + 1 }))
  }
  const closeTest = () => { setPanel(selected ? 'step' : null); setTrace(undefined) }

  // Keyboard: Delete removes the selected step, Esc closes things, ⌘/Ctrl+Z undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return }
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); deleteStep(selected) }
      if (e.key === 'Escape') { if (picker) setPicker(null); else if (panel === 'step') select(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const sel = selected ? stepById(graph, selected) : undefined
  const status = flow.live ? (dirty ? 'Live · unsaved changes' : 'Live') : flow.saved ? (dirty ? 'Off · unsaved changes' : 'Off') : 'Draft'

  return (
    <div className="fb-root">
      <header className="fb-top">
        <Tooltip content="Back to flows" placement="bottom" portal>
          <Button variant="ghost" size="sm" iconOnly aria-label="Back to flows" onClick={onExit}><Icon name="arrowback" size={16} /></Button>
        </Tooltip>
        <div className="fb-top__name">
          {editingName ? (
            <input className="fb-top__name-input" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={() => { setEditingName(false); if (!name.trim()) setName(flow.name) }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }} />
          ) : (
            <button type="button" className="fb-top__name-btn" onClick={() => setEditingName(true)}>{name}<Icon name="edit" size={14} /></button>
          )}
          <Tag color={flow.live ? 'green' : 'default'}>{status}</Tag>
        </div>
        <span className="fb-top__autosave"><Icon name="tick" size={14} />Draft kept automatically</span>

        <div className="fb-top__actions">
          <button type="button" className={`fb-health${errors.length ? ' is-bad' : ' is-good'}${panel === 'issues' ? ' is-open' : ''}`} onClick={() => setPanel((p) => (p === 'issues' ? null : 'issues'))}>
            <Icon name={errors.length ? 'erroricon' : 'rightwithcircle'} size={16} />
            {errors.length ? `${errors.length} to fix` : 'Ready to save'}
          </button>
          <Button variant="secondary" size="sm" iconLeft={<Icon name="view" size={16} />} onClick={() => (panel === 'test' ? closeTest() : startTest(null))}>{panel === 'test' ? 'Stop test' : 'Test flow'}</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!dirty && !!flow.saved}>Save flow</Button>
        </div>
      </header>

      <div className="fb-main">
        <div className="fb-stage">
          <FlowCanvas
            graph={graph} selectedId={selected} onSelect={select}
            onAdd={(target, at) => setPicker({ target, at })} pendingAdd={picker?.target}
            issues={issues} showErrors={showErrors} trace={panel === 'test' ? trace : undefined}
            heights={heights} onMeasure={onMeasure} apiRef={api}
          />
          {banner && (
            <div className={`fb-banner is-${banner.tone}`} role="status">
              <Icon name={banner.tone === 'error' ? 'erroricon' : banner.tone === 'success' ? 'rightwithcircle' : 'info'} size={16} />
              <span>{banner.text}</span>
              {banner.action && <Button variant="secondary" size="xs" onClick={() => { banner.action!.run(); if (banner.action!.label === 'Undo') setBanner(null) }}>{banner.action.label}</Button>}
              <button type="button" className="fb-banner__close" aria-label="Dismiss" onClick={() => setBanner(null)}><Icon name="close" size={14} /></button>
            </div>
          )}
          {graph.steps.length === 1 && !picker && (
            <div className="fb-empty">Press <b>Add step</b> under Start to begin. Each button and branch gets its own path.</div>
          )}
        </div>

        {panel === 'step' && sel && (
          <Inspector
            key={sel.id} step={sel} issues={issues.filter((i) => i.stepId === sel.id)}
            onChange={(fn) => setGraph((g) => updateStep(g, sel.id, fn))}
            onRemoveOut={(outId) => removeOut(sel.id, outId)}
            onDelete={() => deleteStep(sel.id)} onClose={() => select(null)} onTestFrom={() => startTest(sel.id)}
          />
        )}
        {panel === 'issues' && <IssuesPanel graph={graph} issues={issues} onGoTo={goTo} onClose={() => setPanel(null)} />}
        {panel === 'test' && (
          <TestPanel
            graph={graph} flowName={name} startAt={test.startAt} runKey={test.key}
            onTrace={setTrace} onGoTo={(id) => { goTo(id); setPanel('test') }} onClose={closeTest} onRestart={() => setTest((t) => ({ ...t, key: t.key + 1 }))}
          />
        )}
      </div>

      <div ref={pickerAnchor} className="fb-picker-anchor" style={{ left: picker?.at.x ?? 0, top: (picker?.at.y ?? 0) - 4 }} />
      <Popover open={!!picker} onClose={() => setPicker(null)} anchorRef={pickerAnchor} gap={8}>
        {picker && <BlockPicker insert={picker.target.insert} onPick={(t) => addStep(t, picker.target)} />}
      </Popover>

      {confirm && (
        <div className="fb-scrim"><Modal title={confirm.title} icon={<Icon name="delete" size={16} />} onClose={() => setConfirm(null)}
          actions={<><Button variant="secondary" size="sm" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="error" size="sm" onClick={confirm.run}>Delete</Button></>}>
          <ModalText>{confirm.text} You can undo this with ⌘Z.</ModalText>
        </Modal></div>
      )}
    </div>
  )
}

// ---------- the "add a step" menu ----------

const groups: { label: string; types: StepType[] }[] = [
  { label: 'Talk to the visitor', types: ['message', 'buttons', 'question'] },
  { label: 'Decide', types: ['condition'] },
  { label: 'End the branch', types: ['aiAgent', 'assign', 'end'] },
]

function BlockPicker({ insert, onPick }: { insert: boolean; onPick: (t: StepType) => void }) {
  return (
    <div className="fb-picker" role="menu" aria-label="Add a step">
      {groups.map((g) => {
        const list = g.types.filter((t) => !(insert && isEnding(t)))
        return (
          <div key={g.label} className="fb-picker__group">
            <div className="fb-picker__label">{g.label}</div>
            {list.length === 0 ? <div className="fb-picker__note">Endings go at the end of a branch, not in the middle.</div> : list.map((t) => (
              <div key={t} className={`fb-picker__row tone-${stepMeta[t].tone}`}>
                <ListItem compact label={stepMeta[t].label} description={stepMeta[t].description} leading={<ListIcon name={stepMeta[t].icon} background />} onClick={() => onPick(t)} />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ---------- issues ----------

function IssuesPanel({ graph, issues, onGoTo, onClose }: { graph: Graph; issues: ReturnType<typeof validate>; onGoTo: (id: string) => void; onClose: () => void }) {
  const byStep = new Map<string, typeof issues>()
  for (const i of issues) byStep.set(i.stepId, [...(byStep.get(i.stepId) ?? []), i])
  const errors = issues.filter((i) => i.severity === 'error').length
  return (
    <aside className="fb-panel" aria-label="Issues">
      <header className="fb-panel__head">
        <span className={`fb-chip ${errors ? 'tone-pastelRed' : 'tone-pastelGreen'}`}><Icon name={errors ? 'erroricon' : 'rightwithcircle'} size={16} /></span>
        <div className="fb-panel__titles"><h2>{errors ? `${errors} to fix before saving` : 'Ready to save'}</h2><p>Every path must end in an AI agent, Assign or End chat step.</p></div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></Button>
      </header>
      <div className="fb-panel__body fb-scrollable">
        {issues.length === 0 && <p className="fb-help">Nothing to fix. Every button and branch leads to an ending. Test the flow, then save it.</p>}
        {[...byStep.entries()].map(([id, list]) => {
          const s = stepById(graph, id) as Step
          if (!s) return null
          const meta = stepMeta[s.type]
          return (
            <button key={id} type="button" className="fb-issue-card" onClick={() => onGoTo(id)}>
              <span className={`fb-chip tone-${meta.tone}`}><Icon name={meta.icon} size={14} /></span>
              <span className="fb-issue-card__body">
                <span className="fb-issue-card__title">{meta.label} · {stepTitle(s)}</span>
                {list.map((i, n) => <span key={n} className={`fb-issue-card__msg is-${i.severity}`}>{i.message}</span>)}
              </span>
              <Icon name="chevronright" size={16} />
            </button>
          )
        })}
      </div>
    </aside>
  )
}
