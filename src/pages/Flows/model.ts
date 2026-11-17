// Chat Flows (Product Spec: Chat Flows in Omni, PRD-chat-flows.md).
// A flow is a tree: every step has outputs ("outs"), and each output points at one next step or at nothing yet.
// Steps without outputs (AI agent, Assign, End) are endings. A flow can only be saved when every output leads somewhere.
import type { IconName } from '../../icons/iconData'
import type { AvatarColor } from '../../components/Avatar/Avatar'

// ---------- Custom fields of the Chat-Support inbox ----------

export type FieldType = 'dropdown' | 'text' | 'number' | 'date'
export type CustomField = { id: string; label: string; type: FieldType; options?: string[]; /** Where Omni keeps it. */ scope: 'Contact' | 'Chat' }

/** The custom fields saved on the Chat-Support inbox. Conditions read them; Buttons and Question steps can save answers into them. */
export const customFields: CustomField[] = [
  { id: 'customerType', label: 'Customer type', type: 'dropdown', options: ['Homeowner', 'Contractor', 'Business'], scope: 'Contact' },
  { id: 'plan', label: 'Plan', type: 'dropdown', options: ['Free', 'Starter', 'Pro', 'Enterprise'], scope: 'Contact' },
  { id: 'mrr', label: 'MRR (USD)', type: 'number', scope: 'Contact' },
  { id: 'accountNumber', label: 'Account number', type: 'text', scope: 'Chat' },
  { id: 'renewalDate', label: 'Contract renewal date', type: 'date', scope: 'Contact' },
  { id: 'reason', label: 'Reason for contact', type: 'dropdown', options: ['Billing', 'Existing project', 'New installation', 'Something else'], scope: 'Chat' },
]
export const fieldById = (id?: string) => customFields.find((f) => f.id === id)
export const fieldTypeLabel: Record<FieldType, string> = { dropdown: 'Dropdown', text: 'Text', number: 'Number', date: 'Date' }
export const fieldTypeIcon: Record<FieldType, IconName> = { dropdown: 'dropdownrepresentation', text: 'text', number: 'hashnumber', date: 'calander' }

export type Operator = 'is' | 'isNot' | 'contains' | 'gt' | 'lt' | 'before' | 'after' | 'isSet' | 'isNotSet'
export const operatorLabel: Record<Operator, string> = {
  is: 'is', isNot: 'is not', contains: 'contains', gt: 'is greater than', lt: 'is less than', before: 'is before', after: 'is after', isSet: 'is known', isNotSet: 'is not known',
}
export const operatorsFor: Record<FieldType, Operator[]> = {
  dropdown: ['is', 'isNot', 'isSet', 'isNotSet'],
  text: ['is', 'isNot', 'contains', 'isSet', 'isNotSet'],
  number: ['gt', 'lt', 'is', 'isNot', 'isSet', 'isNotSet'],
  date: ['before', 'after', 'is', 'isSet', 'isNotSet'],
}
export const needsValue = (op?: Operator) => op !== 'isSet' && op !== 'isNotSet'

// ---------- Agents of the Chat-Support inbox ----------

export type Agent = { id: string; name: string; initial: string; color: AvatarColor; online: boolean }
export const agents: Agent[] = [
  { id: 'priya', name: 'Priya Sharma', initial: 'P', color: 'red', online: true },
  { id: 'rahul', name: 'Rahul Mehta', initial: 'R', color: 'lightBlue', online: true },
  { id: 'ananya', name: 'Ananya Rao', initial: 'A', color: 'green', online: false },
  { id: 'karan', name: 'Karan Singh', initial: 'K', color: 'orange', online: true },
  { id: 'meera', name: 'Meera Iyer', initial: 'M', color: 'purple', online: true },
  { id: 'arjun', name: 'Arjun Nair', initial: 'A', color: 'yellow', online: false },
]
export const agentById = (id: string) => agents.find((a) => a.id === id)
export const firstName = (id: string) => agentById(id)?.name.split(' ')[0] ?? 'Removed agent'

// ---------- Steps ----------

export type StepType = 'start' | 'message' | 'buttons' | 'question' | 'condition' | 'aiAgent' | 'assign' | 'end'
export type RouteMode = 'one' | 'roundRobin' | 'unassigned'

export type Out = { id: string; label: string; to: string | null; /** The "Anything else" branch of a Buttons step. */ fallback?: boolean }

export type StepData = {
  text?: string
  /** Custom field the answer is saved to (Buttons, Question). */
  saveTo?: string
  /** Condition. */
  field?: string
  op?: Operator
  value?: string
  /** Assign, and the AI agent's handover. */
  mode?: RouteMode
  agents?: string[]
}

export type Step = { id: string; type: StepType; x: number; y: number; data: StepData; outs: Out[] }
export type Graph = { steps: Step[] }

export type StepMeta = { label: string; icon: IconName; /** Pastel family for its colour chip. */ tone: string; description: string; ending?: boolean; group: 'talk' | 'logic' | 'end' }
export const stepMeta: Record<StepType, StepMeta> = {
  start: { label: 'Start', icon: 'chatinbox', tone: 'primary', description: 'Visitor opens chat', group: 'talk' },
  message: { label: 'Message', icon: 'conversation', tone: 'pastelLightBlue', description: 'Send a message, then carry on', group: 'talk' },
  buttons: { label: 'Buttons', icon: 'listview', tone: 'pastelViolet', description: 'Offer 2 to 8 choices, each with its own branch', group: 'talk' },
  question: { label: 'Question', icon: 'text', tone: 'pastelPurple', description: 'Ask for a typed answer and save it', group: 'talk' },
  condition: { label: 'Condition', icon: 'filter', tone: 'pastelOrange', description: 'Branch on plan, MRR or another field', group: 'logic' },
  aiAgent: { label: 'AI agent', icon: 'aiagent', tone: 'pastelYellow', description: 'Let the AI agent answer, with the answers as context', ending: true, group: 'end' },
  assign: { label: 'Assign', icon: 'assigned', tone: 'pastelGreen', description: 'Send the chat to one agent or a round robin', ending: true, group: 'end' },
  end: { label: 'End chat', icon: 'closedstatus', tone: 'pastelRed', description: 'Close the chat with an optional message', ending: true, group: 'end' },
}
export const isEnding = (t: StepType) => !!stepMeta[t].ending

let seq = 0
export const uid = (p = 's') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

/** A new step of a type, with sensible starting content. */
export function newStep(type: StepType, x = 0, y = 0): Step {
  const base = { id: uid(), type, x, y }
  switch (type) {
    case 'message': return { ...base, data: { text: '' }, outs: [{ id: uid('o'), label: 'Next', to: null }] }
    case 'question': return { ...base, data: { text: '' }, outs: [{ id: uid('o'), label: 'After the answer', to: null }] }
    case 'buttons': return { ...base, data: { text: 'What can we help you with?' }, outs: [{ id: uid('o'), label: 'Option 1', to: null }, { id: uid('o'), label: 'Option 2', to: null }] }
    case 'condition': return { ...base, data: { op: 'is' }, outs: [{ id: uid('o'), label: 'True', to: null }, { id: uid('o'), label: 'Otherwise', to: null }] }
    case 'aiAgent': return { ...base, data: { mode: 'unassigned', agents: [] }, outs: [] }
    case 'assign': return { ...base, data: { mode: 'roundRobin', agents: [] }, outs: [] }
    case 'end': return { ...base, data: { text: 'Thanks for reaching out. We’ll get back to you by email.' }, outs: [] }
    default: return { ...base, data: {}, outs: [{ id: uid('o'), label: 'Next', to: null }] }
  }
}

// ---------- Graph helpers ----------

export const stepById = (g: Graph, id: string | null | undefined) => g.steps.find((s) => s.id === id)
export const parentOf = (g: Graph, id: string) => {
  for (const s of g.steps) for (const o of s.outs) if (o.to === id) return { step: s, out: o }
  return undefined
}
/** The ids of a step and everything after it. */
export function subtree(g: Graph, id: string): string[] {
  const s = stepById(g, id)
  if (!s) return []
  return [id, ...s.outs.flatMap((o) => (o.to ? subtree(g, o.to) : []))]
}
export const updateStep = (g: Graph, id: string, fn: (s: Step) => Step): Graph => ({ steps: g.steps.map((s) => (s.id === id ? fn(s) : s)) })

/** Removes a step. A step with one output is spliced out (its parent now points at what came after it); otherwise its whole branch goes. */
export function removeStep(g: Graph, id: string): Graph {
  const s = stepById(g, id)
  if (!s || s.type === 'start') return g
  const parent = parentOf(g, id)
  if (s.outs.length === 1) {
    const next = s.outs[0].to
    return { steps: g.steps.filter((x) => x.id !== id).map((x) => ({ ...x, outs: x.outs.map((o) => (o.to === id ? { ...o, to: next } : o)) })) }
  }
  const gone = new Set(subtree(g, id))
  return {
    steps: g.steps.filter((x) => !gone.has(x.id)).map((x) => (parent && x.id === parent.step.id ? { ...x, outs: x.outs.map((o) => (o.to === id ? { ...o, to: null } : o)) } : x)),
  }
}
/** How many steps go if this one is removed (the step itself included). */
export const removalCount = (g: Graph, id: string) => {
  const s = stepById(g, id)
  if (!s) return 0
  return s.outs.length === 1 ? 1 : subtree(g, id).length
}

// Used by the free-canvas builder (/normal) only.
/** Lays the tree out left to right. `heights` are the measured heights of the cards. */
export const COL = 340
const GAP = 36
export function autoLayout(g: Graph, heights: Record<string, number>): Graph {
  const pos: Record<string, { x: number; y: number }> = {}
  const h = (id: string) => heights[id] ?? 120
  const span = (id: string): number => {
    const s = stepById(g, id)!
    const kids = s.outs.map((o) => o.to).filter(Boolean) as string[]
    const own = h(id) + GAP
    const empties = s.outs.filter((o) => !o.to).length
    const kidsSpan = kids.reduce((a, k) => a + span(k), 0) + (kids.length > 0 ? empties * 44 : 0)
    return Math.max(own, kidsSpan)
  }
  const place = (id: string, depth: number, top: number) => {
    const s = stepById(g, id)!
    const total = span(id)
    pos[id] = { x: depth * COL, y: top + total / 2 - h(id) / 2 }
    let y = top
    for (const o of s.outs) {
      if (!o.to) { if (s.outs.some((x) => x.to)) y += 44; continue }
      place(o.to, depth + 1, y)
      y += span(o.to)
    }
  }
  const start = g.steps.find((s) => s.type === 'start')
  if (!start) return g
  place(start.id, 0, 0)
  return { steps: g.steps.map((s) => (pos[s.id] ? { ...s, ...pos[s.id] } : s)) }
}

// ---------- Validation ----------

export type Issue = { stepId: string; outId?: string; severity: 'error' | 'warning'; message: string }
export const stepTitle = (s: Step) => {
  if (s.type === 'start') return 'Start'
  const t = s.data.text?.trim()
  if ((s.type === 'message' || s.type === 'buttons' || s.type === 'question') && t) return t.length > 34 ? `${t.slice(0, 32)}…` : t
  if (s.type === 'condition' && s.data.field) return `If ${fieldById(s.data.field)?.label ?? 'field'}`
  return stepMeta[s.type].label
}

export function validate(g: Graph): Issue[] {
  const issues: Issue[] = []
  for (const s of g.steps) {
    for (const [n, o] of s.outs.entries()) {
      if (!o.to) {
        const what = s.type === 'buttons' ? (o.fallback ? 'The “Anything else” branch' : `The “${o.label || 'Untitled'}” button`) : s.type === 'condition' ? `The “${n === 0 ? 'True' : 'Otherwise'}” branch` : s.type === 'start' ? 'The flow' : 'This step'
        issues.push({ stepId: s.id, outId: o.id, severity: 'error', message: `${what} leads nowhere. Add a next step or end the branch.` })
      }
    }
    const d = s.data
    if ((s.type === 'message' || s.type === 'question') && !d.text?.trim()) issues.push({ stepId: s.id, severity: 'error', message: `${stepMeta[s.type].label} text is empty.` })
    if (s.type === 'buttons') {
      if (!d.text?.trim()) issues.push({ stepId: s.id, severity: 'error', message: 'The question above the buttons is empty.' })
      const opts = s.outs.filter((o) => !o.fallback)
      if (opts.some((o) => !o.label.trim())) issues.push({ stepId: s.id, severity: 'error', message: 'A button has no label.' })
      const labels = opts.map((o) => o.label.trim().toLowerCase()).filter(Boolean)
      if (new Set(labels).size !== labels.length) issues.push({ stepId: s.id, severity: 'error', message: 'Two buttons have the same label.' })
      const f = fieldById(d.saveTo)
      if (f?.type === 'dropdown') {
        const missing = opts.filter((o) => !f.options!.some((x) => x.toLowerCase() === o.label.trim().toLowerCase()))
        if (missing.length) issues.push({ stepId: s.id, severity: 'warning', message: `“${missing.map((m) => m.label).join('”, “')}” isn’t an option of ${f.label}, so that answer won’t be saved.` })
      }
    }
    if (s.type === 'condition') {
      const f = fieldById(d.field)
      if (!f) issues.push({ stepId: s.id, severity: 'error', message: 'Pick the field this condition checks.' })
      else if (needsValue(d.op) && !d.value?.toString().trim()) issues.push({ stepId: s.id, severity: 'error', message: `Pick the value ${f.label} is compared with.` })
    }
    if (s.type === 'assign') {
      const n = (d.agents ?? []).filter(agentById).length
      if (n === 0) issues.push({ stepId: s.id, severity: 'error', message: d.mode === 'one' ? 'Pick the agent who gets these chats.' : 'Pick the agents in the round robin.' })
    }
    if (s.type === 'aiAgent' && d.mode !== 'unassigned' && !(d.agents ?? []).some(agentById)) {
      issues.push({ stepId: s.id, severity: 'error', message: 'Pick who gets the chat if the AI agent hands over.' })
    }
  }
  return issues
}

// ---------- Describing steps ----------

export function describeRoute(mode: RouteMode | undefined, ids: string[] = []) {
  const names = ids.filter(agentById).map(firstName)
  if (mode === 'unassigned') return 'Unassigned queue'
  if (names.length === 0) return mode === 'one' ? 'No agent picked' : 'No agents picked'
  if (mode === 'one') return names[0]
  return `Round robin · ${names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`}`
}
export function describeCondition(d: StepData) {
  const f = fieldById(d.field)
  if (!f) return 'No field picked yet'
  const v = d.value?.trim()
  const val = !needsValue(d.op) ? '' : f.type === 'number' && v ? ` ${Number(v).toLocaleString()}` : v ? ` ${v}` : ' …'
  return `${f.label} ${operatorLabel[d.op ?? 'is']}${val}`
}
export const conditionOutLabel = (d: StepData) => (fieldById(d.field) ? describeCondition(d) : 'True')

// ---------- Running a condition (test mode) ----------

export type Visitor = { loggedIn: boolean; values: Record<string, string> }
export function evaluate(d: StepData, visitor: Visitor): boolean {
  const f = fieldById(d.field)
  if (!f) return false
  const raw = visitor.loggedIn ? visitor.values[f.id]?.trim() ?? '' : ''
  if (d.op === 'isSet') return raw !== ''
  if (d.op === 'isNotSet') return raw === ''
  if (raw === '') return false // a detail the visitor doesn't have: the condition is not met (PRD §8)
  const v = (d.value ?? '').trim()
  switch (d.op) {
    case 'is': return f.type === 'number' ? Number(raw) === Number(v) : raw.toLowerCase() === v.toLowerCase()
    case 'isNot': return f.type === 'number' ? Number(raw) !== Number(v) : raw.toLowerCase() !== v.toLowerCase()
    case 'contains': return raw.toLowerCase().includes(v.toLowerCase())
    case 'gt': return Number(raw) > Number(v)
    case 'lt': return Number(raw) < Number(v)
    case 'before': return raw < v
    case 'after': return raw > v
    default: return false
  }
}

// ---------- Flows and templates ----------

export type Flow = { id: string; name: string; draft: Graph; saved: Graph | null; live: boolean; editedAt: string }
/** Compares what a flow does, not where its cards sit on the canvas. */
const shape = (g: Graph | null) => JSON.stringify(g?.steps.map(({ x: _x, y: _y, ...rest }) => rest) ?? null)
export const sameGraph = (a: Graph | null, b: Graph | null) => shape(a) === shape(b)

type Spec = { type: StepType; data?: StepData; outs?: { label: string; fallback?: boolean; next?: Spec }[]; next?: Spec }
function build(spec: Spec, steps: Step[]): string {
  const s = newStep(spec.type)
  if (spec.data) s.data = { ...s.data, ...spec.data }
  if (spec.outs) s.outs = spec.outs.map((o) => ({ id: uid('o'), label: o.label, fallback: o.fallback, to: o.next ? build(o.next, steps) : null }))
  else if (spec.next && s.outs[0]) s.outs[0].to = build(spec.next, steps)
  if (s.type === 'condition') s.outs[0].label = conditionOutLabel(s.data)
  steps.push(s)
  return s.id
}
export function graphFrom(spec: Spec | null): Graph {
  const steps: Step[] = []
  const start: Step = { id: uid('start'), type: 'start', x: 0, y: 0, data: {}, outs: [{ id: uid('o'), label: 'Next', to: spec ? build(spec, steps) : null }] }
  return { steps: [start, ...steps] }
}

export type TemplateId = 'reasonAi' | 'reasonPerson' | 'blank'
export const templates: { id: TemplateId; label: string; description: string }[] = [
  { id: 'reasonAi', label: 'Reason for contact, then AI agent, then a person', description: 'Visitors pick a reason. Billing goes straight to finance; the rest go to the AI agent, which hands over to a round robin.' },
  { id: 'reasonPerson', label: 'Reason for contact, then a person', description: 'Visitors pick a reason and each reason reaches the agents who handle it.' },
  { id: 'blank', label: 'Blank flow', description: 'Start from an empty canvas.' },
]

export function templateGraph(id: TemplateId): Graph {
  if (id === 'blank') return graphFrom(null)
  if (id === 'reasonAi') {
    return graphFrom({
      type: 'message', data: { text: 'Hi there 👋 Welcome to Install Partners support.' },
      next: {
        type: 'buttons', data: { text: 'What can we help you with today?', saveTo: 'reason' },
        outs: [
          { label: 'Billing', next: { type: 'question', data: { text: 'What’s your account number?', saveTo: 'accountNumber' }, next: { type: 'assign', data: { mode: 'roundRobin', agents: ['meera', 'karan'] } } } },
          { label: 'Existing project', next: { type: 'aiAgent', data: { mode: 'roundRobin', agents: ['priya', 'rahul'] } } },
          { label: 'Something else', next: { type: 'aiAgent', data: { mode: 'unassigned', agents: [] } } },
        ],
      },
    })
  }
  return graphFrom({
    type: 'buttons', data: { text: 'Hi! What can we help you with?', saveTo: 'reason' },
    outs: [
      { label: 'Billing', next: { type: 'assign', data: { mode: 'roundRobin', agents: [] } } },
      { label: 'Something else', next: { type: 'assign', data: { mode: 'roundRobin', agents: [] } } },
    ],
  })
}

/** The flows that already exist on Chat-Support: one live, one draft that isn't finished. */
export function seedFlows(): Flow[] {
  const live = graphFrom({
    type: 'message', data: { text: 'Hi there 👋 Thanks for reaching out to Install Partners.' },
    next: {
      type: 'buttons', data: { text: 'Who are we talking to?', saveTo: 'customerType' },
      outs: [
        { label: 'Homeowner', next: { type: 'buttons', data: { text: 'What do you need help with?', saveTo: 'reason' }, outs: [
          { label: 'Billing', next: { type: 'assign', data: { mode: 'roundRobin', agents: ['meera', 'karan'] } } },
          { label: 'New installation', next: { type: 'aiAgent', data: { mode: 'roundRobin', agents: ['priya', 'rahul'] } } },
        ] } },
        { label: 'Contractor', next: { type: 'question', data: { text: 'What’s your account number?', saveTo: 'accountNumber' }, next: {
          type: 'condition', data: { field: 'mrr', op: 'gt', value: '1000' },
          outs: [
            { label: 'MRR', next: { type: 'assign', data: { mode: 'one', agents: ['priya'] } } },
            { label: 'Otherwise', next: { type: 'aiAgent', data: { mode: 'roundRobin', agents: ['priya', 'rahul', 'karan'] } } },
          ],
        } } },
        { label: 'Anything else', fallback: true, next: { type: 'aiAgent', data: { mode: 'unassigned', agents: [] } } },
      ],
    },
  })
  const draft = graphFrom({
    type: 'buttons', data: { text: 'What’s this about?', saveTo: 'reason' },
    outs: [
      { label: 'Billing', next: { type: 'condition', data: { field: 'plan', op: 'is', value: 'Enterprise' }, outs: [
        { label: 'x', next: { type: 'assign', data: { mode: 'one', agents: ['meera'] } } },
        { label: 'Otherwise' },
      ] } },
      { label: 'Existing project', next: { type: 'aiAgent', data: { mode: 'roundRobin', agents: [] } } },
      { label: 'New installation' },
      { label: 'Something else' },
    ],
  })
  return [
    { id: 'f1', name: 'Homeowners and contractors', draft: live, saved: live, live: true, editedAt: '12 Nov 2026' },
    { id: 'f2', name: 'Billing triage', draft, saved: null, live: false, editedAt: '15 Nov 2026' },
  ]
}
