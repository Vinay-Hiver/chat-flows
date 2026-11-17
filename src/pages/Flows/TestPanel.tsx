// Test the flow before saving: a chat preview that runs the draft step by step, lighting up the path on the canvas.
// Works on unfinished flows too: when a branch leads nowhere, the test stops there and points at the step.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../icons/Icon'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { Switch } from '../../components/Switch'
import { Tooltip } from '../../components/Tooltip'
import { SelectField } from './Inspector'
import { agentById, customFields, describeCondition, describeRoute, evaluate, fieldById, firstName, stepById } from './model'
import type { Graph, Out, Step, Visitor } from './model'
import type { TestTrace } from './FlowCanvas'

type Item =
  | { kind: 'bot'; text: string }
  | { kind: 'visitor'; text: string }
  | { kind: 'choices'; stepId: string; options: Out[]; picked?: string }
  | { kind: 'system'; text: string; detail?: string; tone?: 'ok' | 'info' }
  | { kind: 'stuck'; stepId: string; text: string }
  | { kind: 'summary'; answers: { q: string; a: string }[]; path: string[]; ending: string }

type Props = {
  graph: Graph
  flowName: string
  startAt: string | null
  runKey: number
  onTrace: (t: TestTrace | undefined) => void
  onGoTo: (stepId: string) => void
  onClose: () => void
  onRestart: () => void
}

const defaultVisitor: Visitor = { loggedIn: true, values: { customerType: 'Contractor', plan: 'Pro', mrr: '1200', accountNumber: '', renewalDate: '2027-02-01', reason: '' } }

export function TestPanel({ graph, flowName, startAt, runKey, onTrace, onGoTo, onClose, onRestart }: Props) {
  const [visitor, setVisitor] = useState<Visitor>(defaultVisitor)
  const [showVisitor, setShowVisitor] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [waiting, setWaiting] = useState<{ stepId: string; type: 'buttons' | 'question'; misses: number } | null>(null)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const graphRef = useRef(graph)
  graphRef.current = graph
  const run = useRef({ id: 0, visited: new Set<string>(), taken: new Set<string>(), values: {} as Record<string, string>, known: new Set<string>(), answers: [] as { q: string; a: string }[], path: [] as string[] })
  const rr = useRef<Record<string, number>>({})
  const scroller = useRef<HTMLDivElement>(null)

  const push = (...it: Item[]) => setItems((l) => [...l, ...it])
  const publish = (active?: string, stuckOut?: string) => onTrace({ active, visited: new Set(run.current.visited), taken: new Set(run.current.taken), stuckOut })

  const later = (fn: () => void, ms = 550) => {
    const id = run.current.id
    setTyping(true)
    setTimeout(() => { if (run.current.id === id) { setTyping(false); fn() } }, ms)
  }

  const follow = (s: Step, out: Out | undefined) => {
    if (!out) return
    if (!out.to || !stepById(graphRef.current, out.to)) {
      const what = s.type === 'buttons' ? `The “${out.label}” button` : s.type === 'condition' ? `The “${s.outs.indexOf(out) === 0 ? 'True' : 'Otherwise'}” branch` : 'This step'
      push({ kind: 'stuck', stepId: s.id, text: `${what} leads nowhere, so a real visitor would be stuck here. Add a next step before saving.` })
      publish(s.id, out.id)
      return
    }
    run.current.taken.add(out.id)
    const next = out.to
    later(() => visit(next))
  }

  const finish = (ending: string) => {
    push({ kind: 'summary', answers: run.current.answers, path: run.current.path, ending })
  }

  const visit = (id: string) => {
    const s = stepById(graphRef.current, id)
    if (!s) return
    const r = run.current
    r.visited.add(id)
    publish(id)
    const d = s.data
    switch (s.type) {
      case 'start': follow(s, s.outs[0]); break
      case 'message': push({ kind: 'bot', text: d.text?.trim() || '(empty message)' }); follow(s, s.outs[0]); break
      case 'buttons':
        push({ kind: 'bot', text: d.text?.trim() || '(no question)' }, { kind: 'choices', stepId: s.id, options: s.outs.filter((o) => !o.fallback) })
        setWaiting({ stepId: s.id, type: 'buttons', misses: 0 })
        break
      case 'question':
        push({ kind: 'bot', text: d.text?.trim() || '(empty question)' })
        setWaiting({ stepId: s.id, type: 'question', misses: 0 })
        break
      case 'condition': {
        const f = fieldById(d.field)
        const raw = f ? r.values[f.id] ?? '' : ''
        const known = f ? r.known.has(f.id) : false
        const ok = evaluate(d, { loggedIn: known, values: r.values })
        push({
          kind: 'system', tone: 'info', text: `Checked: ${describeCondition(d)} → ${ok ? 'True' : 'Otherwise'}`,
          detail: f ? (known && raw ? `${f.label} is ${f.type === 'number' ? Number(raw).toLocaleString() : raw}` : `${f.label} isn’t known for this visitor`) : 'No field picked',
        })
        follow(s, s.outs[ok ? 0 : 1])
        break
      }
      case 'aiAgent':
        push({ kind: 'system', tone: 'ok', text: 'Handed to the AI agent', detail: `With ${r.answers.length} answer${r.answers.length === 1 ? '' : 's'} as context. If it hands over: ${describeRoute(d.mode, d.agents)}.` })
        finish('AI agent')
        publish(id)
        break
      case 'assign': {
        const ids = (d.agents ?? []).filter(agentById)
        let text = 'Sent to the unassigned queue'
        let detail = 'No agents picked on this step.'
        if (d.mode === 'one' && ids[0]) { text = `Assigned to ${agentById(ids[0])!.name}`; detail = agentById(ids[0])!.online ? 'Lands in their queue.' : 'They’re away, but it lands in their queue anyway because they were picked on purpose.' }
        else if (ids.length) {
          const online = ids.filter((x) => agentById(x)!.online)
          if (online.length === 0) { text = 'Sent to the unassigned queue'; detail = `None of ${ids.map(firstName).join(', ')} is available right now.` }
          else {
            const n = rr.current[s.id] ?? 0
            rr.current[s.id] = n + 1
            const who = agentById(online[n % online.length])!
            text = `Assigned to ${who.name} (round robin)`
            detail = `Rotates among ${ids.map(firstName).join(', ')}${online.length < ids.length ? `, skipping ${ids.filter((x) => !agentById(x)!.online).map(firstName).join(', ')} (away)` : ''}.`
          }
        }
        push({ kind: 'system', tone: 'ok', text, detail })
        finish(text)
        publish(id)
        break
      }
      case 'end':
        if (d.text?.trim()) push({ kind: 'bot', text: d.text })
        push({ kind: 'system', tone: 'ok', text: 'Chat closed by the flow' })
        finish('Closed by the flow')
        publish(id)
        break
    }
  }

  const begin = useCallback(() => {
    const r = run.current
    r.id += 1
    r.visited = new Set(); r.taken = new Set(); r.answers = []; r.path = []
    r.values = visitor.loggedIn ? { ...visitor.values } : {}
    r.known = new Set(visitor.loggedIn ? Object.keys(visitor.values).filter((k) => visitor.values[k]?.trim()) : [])
    setItems([]); setWaiting(null); setTyping(false); setDraft('')
    const start = startAt ?? graphRef.current.steps.find((s) => s.type === 'start')?.id
    if (start) later(() => visit(start), 250)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, startAt, visitor])

  useEffect(() => { begin() }, [begin])
  useEffect(() => () => { run.current.id += 1; onTrace(undefined) }, [onTrace])
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [items, typing])

  const answer = (s: Step, value: string, label: string) => {
    const r = run.current
    r.answers.push({ q: s.data.text?.trim() || label, a: value })
    r.path.push(value)
    const f = fieldById(s.data.saveTo)
    if (f) { r.values[f.id] = value; r.known.add(f.id) }
  }

  const pick = (stepId: string, out: Out) => {
    const s = stepById(graphRef.current, stepId)
    if (!s || waiting?.stepId !== stepId) return
    setItems((l) => l.map((it) => (it.kind === 'choices' && it.stepId === stepId && !it.picked ? { ...it, picked: out.id } : it)))
    push({ kind: 'visitor', text: out.label })
    setWaiting(null)
    answer(s, out.label, 'Choice')
    follow(s, out)
  }

  const send = () => {
    const text = draft.trim()
    if (!text || !waiting) return
    setDraft('')
    const s = stepById(graphRef.current, waiting.stepId)
    if (!s) return
    if (waiting.type === 'question') {
      push({ kind: 'visitor', text })
      setWaiting(null)
      answer(s, text, 'Answer')
      follow(s, s.outs[0])
      return
    }
    const match = s.outs.find((o) => !o.fallback && o.label.trim().toLowerCase() === text.toLowerCase())
    if (match) { pick(s.id, match); return }
    push({ kind: 'visitor', text })
    if (waiting.misses === 0) {
      setItems((l) => l.map((it) => (it.kind === 'choices' && it.stepId === s.id && !it.picked ? { ...it, picked: 'none' } : it)))
      setWaiting({ ...waiting, misses: 1 })
      later(() => push({ kind: 'bot', text: 'Sorry, I didn’t get that. Please pick one of these:' }, { kind: 'choices', stepId: s.id, options: s.outs.filter((o) => !o.fallback) }))
      return
    }
    setItems((l) => l.map((it) => (it.kind === 'choices' && it.stepId === s.id && !it.picked ? { ...it, picked: 'none' } : it)))
    setWaiting(null)
    answer(s, text, 'Typed')
    const fb = s.outs.find((o) => o.fallback)
    if (fb) { push({ kind: 'system', tone: 'info', text: 'No button matched twice → “Anything else” branch' }); follow(s, fb) }
    else { push({ kind: 'system', tone: 'ok', text: 'Sent to the unassigned queue', detail: 'No button matched twice and this step has no “Anything else” branch.' }); finish('Unassigned queue'); publish(s.id) }
  }

  const setValue = (id: string, v: string) => setVisitor((x) => ({ ...x, values: { ...x.values, [id]: v } }))

  return (
    <aside className="fb-panel fb-test" aria-label="Test the flow">
      <header className="fb-panel__head">
        <span className="fb-chip tone-primary"><Icon name="view" size={16} /></span>
        <div className="fb-panel__titles"><h2>Test the flow</h2><p>{startAt ? 'Starting from the selected step' : 'Nothing is sent to real visitors'}</p></div>
        <Tooltip content="Restart" placement="bottom" portal><Button variant="ghost" size="sm" iconOnly aria-label="Restart test" onClick={onRestart}><Icon name="refresh" size={16} /></Button></Tooltip>
        <Tooltip content="Close test" placement="bottom" portal><Button variant="ghost" size="sm" iconOnly aria-label="Close test" onClick={onClose}><Icon name="close" size={16} /></Button></Tooltip>
      </header>

      <div className="fb-visitor">
        <button type="button" className="fb-visitor__toggle" onClick={() => setShowVisitor((v) => !v)} aria-expanded={showVisitor}>
          <Icon name="contact" size={16} />
          <span>Test visitor: <b>{visitor.loggedIn ? `${visitor.values.customerType || 'Logged in'} · ${visitor.values.plan || '—'} · $${Number(visitor.values.mrr || 0).toLocaleString()} MRR` : 'Anonymous'}</b></span>
          <Icon name={showVisitor ? 'chevrontop' : 'chevrondown'} size={16} />
        </button>
        {showVisitor && (
          <div className="fb-visitor__form fb-scrollable">
            <Switch label="Logged-in visitor (Omni knows their fields)" checked={visitor.loggedIn} onChange={(e) => setVisitor((x) => ({ ...x, loggedIn: e.target.checked }))} />
            {visitor.loggedIn && customFields.filter((f) => f.id !== 'reason' && f.id !== 'accountNumber').map((f) => (
              f.type === 'dropdown'
                ? <SelectField key={f.id} label={f.label} value={visitor.values[f.id] || 'unknown'} options={[{ value: 'unknown', label: 'Not known' }, ...f.options!.map((o) => ({ value: o, label: o }))]} onChange={(v) => setValue(f.id, v === 'unknown' ? '' : v)} />
                : <Input key={f.id} label={f.label} size="sm" fullWidth type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={visitor.values[f.id] ?? ''} onChange={(e) => setValue(f.id, e.target.value)} />
            ))}
            <p className="fb-help fb-help--tight">Changing the visitor restarts the test.</p>
          </div>
        )}
      </div>

      <div className="fb-chat fb-scrollable" ref={scroller}>
        <div className="fb-chat__flow">{flowName}</div>
        {items.map((it, i) => {
          switch (it.kind) {
            case 'bot': return <div key={i} className="fb-msg is-bot">{it.text}</div>
            case 'visitor': return <div key={i} className="fb-msg is-visitor">{it.text}</div>
            case 'choices': return (
              <div key={i} className="fb-choices">
                {it.options.map((o) => (
                  <button key={o.id} type="button" className={`fb-choice${it.picked === o.id ? ' is-picked' : ''}`} disabled={!!it.picked} onClick={() => pick(it.stepId, o)}>{o.label || 'Untitled'}</button>
                ))}
              </div>
            )
            case 'system': return (
              <div key={i} className={`fb-sys is-${it.tone ?? 'info'}`}>
                <Icon name={it.tone === 'ok' ? 'rightwithcircle' : 'filter'} size={14} />
                <div><div className="fb-sys__text">{it.text}</div>{it.detail && <div className="fb-sys__detail">{it.detail}</div>}</div>
              </div>
            )
            case 'stuck': return (
              <div key={i} className="fb-stuck">
                <Icon name="erroricon" size={16} />
                <div>
                  <div className="fb-stuck__title">The flow stops here</div>
                  <div className="fb-stuck__text">{it.text}</div>
                  <Button variant="secondary" size="xs" onClick={() => onGoTo(it.stepId)}>Go to step</Button>
                </div>
              </div>
            )
            case 'summary': return (
              <div key={i} className="fb-summary">
                <div className="fb-summary__label">What the agent sees at the top of the chat</div>
                <div className="fb-summary__card">
                  <div className="fb-summary__flow"><Icon name="flows" size={14} />{flowName}</div>
                  {it.answers.length > 0
                    ? <div className="fb-summary__answers">{it.answers.map((a, n) => <span key={n}><b>{a.q.replace(/\?$/, '')}:</b> {a.a}</span>)}</div>
                    : <div className="fb-summary__answers"><span>No answers collected</span></div>}
                  <div className="fb-summary__end">Ended: {it.ending}</div>
                </div>
                <Button variant="ghost" size="sm" iconLeft={<Icon name="refresh" size={16} />} onClick={onRestart}>Run again</Button>
              </div>
            )
          }
        })}
        {typing && <div className="fb-msg is-bot is-typing"><span /><span /><span /></div>}
      </div>

      <form className="fb-composer" onSubmit={(e) => { e.preventDefault(); send() }}>
        <Input
          size="md" fullWidth value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!waiting}
          placeholder={!waiting ? 'The flow is not waiting for a reply' : waiting.type === 'question' ? 'Type the visitor’s answer' : 'Pick a button or type a reply'}
        />
        <Button variant="primary" size="md" iconOnly aria-label="Send" disabled={!waiting || !draft.trim()} type="submit"><Icon name="send" size={16} /></Button>
      </form>
    </aside>
  )
}
