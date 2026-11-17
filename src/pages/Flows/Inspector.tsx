// The right panel for the selected step. Every change applies straight away (no Save/Cancel inside the panel).
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '../../icons/Icon'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { Textarea } from '../../components/Textarea'
import { Switch } from '../../components/Switch'
import { Popover } from '../../components/Popover'
import { Dropdown } from '../../components/Dropdown'
import type { DropdownOption } from '../../components/Dropdown/Dropdown'
import { Radio, RadioGroup } from '../../components/Radio'
import { Tag } from '../../components/Tag'
import { Tooltip } from '../../components/Tooltip'
import { agents, agentById, customFields, describeCondition, fieldById, fieldTypeIcon, fieldTypeLabel, needsValue, operatorLabel, operatorsFor, stepMeta, uid } from './model'
import type { Issue, Operator, RouteMode, Step, StepData } from './model'

type Props = {
  step: Step
  issues: Issue[]
  onChange: (fn: (s: Step) => Step) => void
  onRemoveOut: (outId: string) => void
  onDelete: () => void
  onClose: () => void
  onTestFrom: () => void
}

export function Inspector({ step, issues, onChange, onRemoveOut, onDelete, onClose, onTestFrom }: Props) {
  const meta = stepMeta[step.type]
  const setData = (patch: Partial<StepData>) => onChange((s) => ({ ...s, data: { ...s.data, ...patch } }))
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  return (
    <aside className="fb-panel" aria-label={`${meta.label} step`}>
      <header className="fb-panel__head">
        <span className={`fb-chip tone-${meta.tone}`}><Icon name={meta.icon} size={16} /></span>
        <div className="fb-panel__titles">
          <h2>{step.type === 'start' ? 'Start' : meta.label}</h2>
          <p>{step.type === 'start' ? 'Runs when a visitor opens chat' : meta.description}</p>
        </div>
        {step.type !== 'start' && (
          <Tooltip content="Delete step" placement="bottom" portal><Button variant="ghost" size="sm" iconOnly aria-label="Delete step" onClick={onDelete}><Icon name="delete" size={16} /></Button></Tooltip>
        )}
        <Tooltip content="Close" placement="bottom" portal><Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></Button></Tooltip>
      </header>

      <div className="fb-panel__body fb-scrollable">
        {(errors.length > 0 || warnings.length > 0) && (
          <div className="fb-issues-inline">
            {errors.map((i, n) => <div key={`e${n}`} className="fb-issue is-error"><Icon name="erroricon" size={14} /><span>{i.message}</span></div>)}
            {warnings.map((i, n) => <div key={`w${n}`} className="fb-issue is-warning"><Icon name="alerttriangle" size={14} /><span>{i.message}</span></div>)}
          </div>
        )}

        {step.type === 'start' && (
          <p className="fb-help">The flow starts after the pre-chat form. Logged-in visitors skip details Omni already has. A returning visitor with an open chat carries on in that chat, so the flow doesn’t start again.</p>
        )}

        {step.type === 'message' && (
          <Textarea label="Message" fullWidth rows={4} maxLength={1000} showCount placeholder="Hi, how can we help you today?" value={step.data.text ?? ''} onChange={(e) => setData({ text: e.target.value })} />
        )}

        {step.type === 'question' && (
          <>
            <Textarea label="Question" fullWidth rows={3} maxLength={1000} showCount placeholder="What’s your account number?" value={step.data.text ?? ''} onChange={(e) => setData({ text: e.target.value })} />
            <p className="fb-help">The flow waits for the visitor’s reply, then carries on.</p>
            <SaveToField value={step.data.saveTo} types={['text', 'number', 'date']} onChange={(saveTo) => setData({ saveTo })} />
          </>
        )}

        {step.type === 'buttons' && <ButtonsEditor step={step} onChange={onChange} onRemoveOut={onRemoveOut} setData={setData} />}
        {step.type === 'condition' && <ConditionEditor data={step.data} setData={setData} />}

        {step.type === 'assign' && (
          <>
            <Section label="Send the chat to">
              <RadioGroup name={`mode-${step.id}`} value={step.data.mode} onChange={(v) => setData({ mode: v as RouteMode, agents: v === 'one' ? (step.data.agents ?? []).slice(0, 1) : step.data.agents })}>
                <Radio value="roundRobin" label="Round robin among agents I pick" />
                <Radio value="one" label="One agent" />
              </RadioGroup>
            </Section>
            <AgentPicker multi={step.data.mode !== 'one'} value={step.data.agents ?? []} onChange={(ids) => setData({ agents: ids })} />
            <p className="fb-help">
              {step.data.mode === 'one'
                ? 'The chat goes to this agent’s queue even when they’re away, because you picked them on purpose. Use a round robin to cover for absences.'
                : 'Chats rotate only among these agents, skipping anyone away or offline. If none of them is available, the chat goes to Unassigned.'}
            </p>
          </>
        )}

        {step.type === 'aiAgent' && (
          <>
            <p className="fb-help">The AI agent answers next, with every answer from this flow as context.</p>
            <Section label="If the AI agent hands over, send the chat to">
              <RadioGroup name={`handover-${step.id}`} value={step.data.mode} onChange={(v) => setData({ mode: v as RouteMode, agents: v === 'one' ? (step.data.agents ?? []).slice(0, 1) : step.data.agents })}>
                <Radio value="roundRobin" label="Round robin among agents I pick" />
                <Radio value="one" label="One agent" />
                <Radio value="unassigned" label="The unassigned queue" />
              </RadioGroup>
            </Section>
            {step.data.mode !== 'unassigned' && <AgentPicker multi={step.data.mode !== 'one'} value={step.data.agents ?? []} onChange={(ids) => setData({ agents: ids })} />}
          </>
        )}

        {step.type === 'end' && (
          <>
            <Textarea label="Closing message (optional)" fullWidth rows={3} maxLength={1000} showCount value={step.data.text ?? ''} onChange={(e) => setData({ text: e.target.value })} />
            <p className="fb-help">The chat closes after this message. Outside business hours, the answers become a conversation in Unassigned.</p>
          </>
        )}
      </div>

      {step.type !== 'start' && (
        <footer className="fb-panel__foot">
          <Button variant="secondary" size="sm" iconLeft={<Icon name="view" size={16} />} onClick={onTestFrom}>Test from this step</Button>
        </footer>
      )}
    </aside>
  )
}

function Section({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="fb-section">
      <div className="fb-section__label">{label}{hint && <span className="fb-section__hint">{hint}</span>}</div>
      {children}
    </div>
  )
}

// ---------- Buttons ----------

function ButtonsEditor({ step, onChange, onRemoveOut, setData }: { step: Step; onChange: Props['onChange']; onRemoveOut: (id: string) => void; setData: (p: Partial<StepData>) => void }) {
  const opts = step.outs.filter((o) => !o.fallback)
  const fallback = step.outs.find((o) => o.fallback)
  const setLabel = (id: string, label: string) => onChange((s) => ({ ...s, outs: s.outs.map((o) => (o.id === id ? { ...o, label } : o)) }))
  const add = () => onChange((s) => {
    const list = s.outs.filter((o) => !o.fallback)
    const fb = s.outs.filter((o) => o.fallback)
    return { ...s, outs: [...list, { id: uid('o'), label: `Option ${list.length + 1}`, to: null }, ...fb] }
  })
  const saveField = fieldById(step.data.saveTo)

  return (
    <>
      <Textarea label="Question above the buttons" fullWidth rows={2} maxLength={500} placeholder="What can we help you with?" value={step.data.text ?? ''} onChange={(e) => setData({ text: e.target.value })} />
      <Section label="Buttons" hint={`${opts.length} of 8`}>
        <div className="fb-options">
          {opts.map((o, i) => (
            <div key={o.id} className="fb-option">
              <span className="fb-option__n">{i + 1}</span>
              <Input size="sm" fullWidth value={o.label} placeholder="Button label" error={!o.label.trim()} onChange={(e) => setLabel(o.id, e.target.value)} />
              <Tooltip content={opts.length <= 2 ? 'A Buttons step needs at least 2 buttons' : o.to ? 'Remove button and its branch' : 'Remove button'} placement="left" portal>
                <Button variant="ghost" size="sm" iconOnly aria-label="Remove button" disabled={opts.length <= 2} onClick={() => onRemoveOut(o.id)}><Icon name="close" size={16} /></Button>
              </Tooltip>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" iconLeft={<Icon name="add" size={16} />} disabled={opts.length >= 8} onClick={add}>Add button</Button>
        {saveField?.type === 'dropdown' && (
          <div className="fb-suggest">
            <span>Use the options of {saveField.label}:</span>
            <Button variant="secondary" size="xs" onClick={() => onChange((s) => {
              const fb = s.outs.filter((o) => o.fallback)
              const current = s.outs.filter((o) => !o.fallback)
              const outs = saveField.options!.slice(0, 8).map((label, i) => ({ ...(current[i] ?? { id: uid('o'), to: null }), label }))
              const dropped = current.slice(outs.length).filter((o) => o.to)
              return dropped.length ? s : { ...s, outs: [...outs, ...fb] }
            })}>Fill buttons</Button>
          </div>
        )}
      </Section>
      <Section label="When the visitor types instead">
        <p className="fb-help fb-help--tight">Typed text that matches a button counts as picking it. Otherwise the buttons are shown once more.</p>
        <Switch
          label="Add an “Anything else” branch" checked={!!fallback}
          onChange={(e) => {
            if (e.target.checked) onChange((s) => ({ ...s, outs: [...s.outs, { id: uid('o'), label: 'Anything else', to: null, fallback: true }] }))
            else if (fallback) onRemoveOut(fallback.id)
          }}
        />
        {!fallback && <p className="fb-help fb-help--tight">Without it, a second reply that matches no button goes to the unassigned queue.</p>}
      </Section>
      <SaveToField value={step.data.saveTo} types={['dropdown', 'text']} onChange={(saveTo) => setData({ saveTo })} />
    </>
  )
}

// ---------- Condition ----------

function ConditionEditor({ data, setData }: { data: StepData; setData: (p: Partial<StepData>) => void }) {
  const f = fieldById(data.field)
  const ops = f ? operatorsFor[f.type] : []
  return (
    <>
      <p className="fb-help">Branches on what Omni already knows about the visitor: their contact, account and chat fields.</p>
      <SelectField
        label="Field" placeholder="Pick a field" value={data.field}
        options={customFields.map((c) => ({ value: c.id, label: c.label, description: `${fieldTypeLabel[c.type]} · ${c.scope} field`, icon: fieldTypeIcon[c.type] }))}
        onChange={(field) => { const nf = fieldById(field)!; setData({ field, op: operatorsFor[nf.type][0], value: '' }) }}
        searchable
      />
      {f && (
        <SelectField label="Condition" value={data.op} options={ops.map((o) => ({ value: o, label: operatorLabel[o] }))} onChange={(op) => setData({ op: op as Operator })} />
      )}
      {f && needsValue(data.op) && (
        f.type === 'dropdown' ? (
          <SelectField label="Value" placeholder="Pick a value" value={data.value} options={f.options!.map((o) => ({ value: o, label: o }))} onChange={(value) => setData({ value })} />
        ) : (
          <Input
            label="Value" size="md" fullWidth type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
            prefix={f.id === 'mrr' ? '$' : undefined} placeholder={f.type === 'number' ? '1000' : 'Value'}
            value={data.value ?? ''} error={!data.value?.trim()} onChange={(e) => setData({ value: e.target.value })}
          />
        )
      )}
      {f && (
        <div className="fb-explain">
          <div><span className="fb-explain__tag is-true">True</span>Visitors where <b>{describeCondition(data)}</b></div>
          <div><span className="fb-explain__tag">Otherwise</span>Everyone else, including visitors whose {f.label} we don’t know (for example anonymous visitors)</div>
        </div>
      )}
    </>
  )
}

// ---------- Shared fields ----------

function SaveToField({ value, types, onChange }: { value?: string; types: ('dropdown' | 'text' | 'number' | 'date')[]; onChange: (v: string | undefined) => void }) {
  const list = customFields.filter((c) => types.includes(c.type))
  return (
    <Section label="Save the answer to a custom field" hint="Optional">
      <SelectField
        placeholder="Don’t save" value={value ?? 'none'}
        options={[{ value: 'none', label: 'Don’t save', icon: 'close' }, ...list.map((c) => ({ value: c.id, label: c.label, description: `${fieldTypeLabel[c.type]} · ${c.scope} field`, icon: fieldTypeIcon[c.type] }))]}
        onChange={(v) => onChange(v === 'none' ? undefined : v)}
      />
      <p className="fb-help fb-help--tight">Agents always see the answer at the top of the chat, saved or not.</p>
    </Section>
  )
}

export function SelectField({ label, placeholder, value, options, onChange, searchable }: { label?: string; placeholder?: string; value?: string; options: DropdownOption[]; onChange: (v: string) => void; searchable?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)
  return (
    <div ref={ref} className="fb-select">
      <Input
        label={label} fullWidth readOnly value={current?.label ?? ''} placeholder={placeholder}
        prefix={current?.icon ? <Icon name={current.icon} size={14} /> : undefined}
        suffix={<Icon name="chevrondown" size={16} />}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } }}
      />
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} matchAnchorWidth>
        <Dropdown options={options} value={value} searchable={searchable} onChange={(v) => { onChange(v as string); setOpen(false) }} />
      </Popover>
    </div>
  )
}

function AgentPicker({ multi, value, onChange }: { multi: boolean; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const picked = value.map(agentById).filter(Boolean)
  const options = agents.map((a) => ({ value: a.id, label: a.name, color: a.color, showStatus: true, status: a.online ? 'online' as const : 'offline' as const, description: a.online ? 'Available' : 'Away' }))
  return (
    <Section label={multi ? 'Agents in the round robin' : 'Agent'} hint={multi ? `${picked.length} picked` : undefined}>
      <div ref={ref}>
        <Button variant="secondary" size="sm" iconLeft={<Icon name={multi ? 'team' : 'user'} size={16} />} onClick={() => setOpen((o) => !o)}>
          {multi ? 'Choose agents' : picked[0] ? 'Change agent' : 'Choose agent'}
        </Button>
      </div>
      {picked.length > 0 && (
        <div className="fb-tags">
          {picked.map((a) => <Tag key={a!.id} onRemove={() => onChange(value.filter((x) => x !== a!.id))} removeLabel={`Remove ${a!.name}`}>{a!.name}</Tag>)}
        </div>
      )}
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref}>
        {multi ? (
          <Dropdown variant="checkbox" searchable options={options} value={value} onChange={(v) => onChange(v as string[])} />
        ) : (
          <Dropdown variant="avatar" searchable options={options} value={value[0]} onChange={(v) => { onChange([v as string]); setOpen(false) }} />
        )}
      </Popover>
    </Section>
  )
}
