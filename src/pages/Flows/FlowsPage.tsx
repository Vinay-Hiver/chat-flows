// Admin › Shared Inbox › Chat-Support › Flows: the list of chat flows, creating one from a template, and the full-screen builder.
import { useState } from 'react'
import { Icon } from '../../icons/Icon'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { Modal, ModalText } from '../../components/Modal'
import { Switch } from '../../components/Switch'
import { Table } from '../../components/Table'
import { Tag } from '../../components/Tag'
import { Tooltip } from '../../components/Tooltip'
import { ListRadio } from '../../components/List'
import { PageBar } from '../SharedInboxes/SharedInboxesPage'
import { FlowBuilder } from './FlowBuilder'
import { customFields, fieldTypeIcon, fieldTypeLabel, sameGraph, seedFlows, templateGraph, templates, uid, validate } from './model'
import type { Flow, TemplateId } from './model'
import './FlowBuilder.css'

// Kept outside the component so flows survive switching to another settings page and back.
let store: Flow[] = seedFlows()
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function FlowsPage() {
  const [flows, setFlowsState] = useState<Flow[]>(store)
  const setFlows = (fn: (f: Flow[]) => Flow[]) => setFlowsState((f) => (store = fn(f)))
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Flow | null>(null)

  const patch = (id: string, p: Partial<Flow>) => setFlows((list) => list.map((f) => (f.id === id ? { ...f, ...p } : f)))
  const turnOn = (id: string, on: boolean) => setFlows((list) => list.map((f) => (f.id === id ? { ...f, live: on } : on ? { ...f, live: false } : f)))

  const open = flows.find((f) => f.id === openId)
  if (open) {
    return (
      <FlowBuilder
        key={open.id} flow={open}
        onDraft={(draft, name) => patch(open.id, { draft, name })}
        onSave={(graph, name) => patch(open.id, { saved: graph, draft: graph, name, editedAt: today() })}
        onTurnOn={() => turnOn(open.id, true)}
        onExit={() => setOpenId(null)}
      />
    )
  }

  return (
    <div className="hot-shared-inboxes__page">
      <PageBar title="Flows" action={<Button variant="primary" size="sm" iconLeft={<Icon name="add" size={16} />} onClick={() => setCreating(true)}>Create flow</Button>} />
      <div className="fl-body fb-scrollable" style={{ overflowY: 'auto' }}>
        <div className="fl-note"><Icon name="info" size={14} />A flow runs after the pre-chat form and before the AI agent or a person. One flow can be on for the Chat-Support widget at a time.</div>
        <Table
          aria-label="Flows" rows={flows} getRowId={(f) => f.id} onRowClick={(f) => setOpenId(f.id)}
          rowActions={[{ icon: 'edit', label: 'Edit', onClick: (f) => setOpenId(f.id) }, { icon: 'delete', label: 'Delete', onClick: (f) => setDeleting(f) }]}
          columns={[
            {
              key: 'name', header: 'Name', render: (f) => (
                <span className="fl-name"><Icon name="flows" size={16} />{f.name}{f.saved && !sameGraph(f.saved, f.draft) && <Tag>Unsaved changes</Tag>}{!f.saved && <Tag color="yellow">Draft</Tag>}</span>
              ),
            },
            { key: 'steps', header: 'Steps', width: '12%', render: (f) => String(f.draft.steps.length - 1) },
            {
              key: 'status', header: 'Status', width: '22%', render: (f) => {
                const blocked = !f.saved || validate(f.saved).some((i) => i.severity === 'error')
                const sw = (
                  <span className="fl-status" onClick={(e) => e.stopPropagation()}>
                    <Switch checked={f.live} disabled={blocked && !f.live} onChange={(e) => turnOn(f.id, e.target.checked)} label={f.live ? 'On' : 'Off'} />
                  </span>
                )
                return blocked && !f.live ? <Tooltip content="Save a finished version of this flow before turning it on" portal>{sw}</Tooltip> : sw
              },
            },
            { key: 'edited', header: 'Last saved', width: '18%', render: (f) => (f.saved ? f.editedAt : '—') },
          ]}
        />

        <section className="fl-fields" aria-label="Custom fields">
          <div className="fl-fields__head">
            <div><h3>Custom fields on Chat-Support</h3><p>Conditions can check these, and Buttons and Question steps can save answers into them.</p></div>
          </div>
          <Table
            aria-label="Custom fields" rows={customFields} getRowId={(f) => f.id}
            columns={[
              { key: 'label', header: 'Field', render: (f) => <span className="fl-name"><Icon name={fieldTypeIcon[f.type]} size={16} />{f.label}</span> },
              { key: 'type', header: 'Type', width: '14%', render: (f) => fieldTypeLabel[f.type] },
              { key: 'options', header: 'Options', render: (f) => f.options?.join(', ') ?? '—' },
              { key: 'scope', header: 'Saved on', width: '14%', render: (f) => f.scope },
            ]}
          />
        </section>
      </div>

      {creating && <CreateFlowModal onClose={() => setCreating(false)} onCreate={(name, t) => {
        const graph = templateGraph(t)
        const f: Flow = { id: uid('f'), name, draft: graph, saved: null, live: false, editedAt: today() }
        setFlows((l) => [...l, f])
        setCreating(false)
        setOpenId(f.id)
      }} />}

      {deleting && (
        <div className="fb-scrim"><Modal title="Delete flow?" icon={<Icon name="delete" size={16} />} onClose={() => setDeleting(null)}
          actions={<><Button variant="secondary" size="sm" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="error" size="sm" onClick={() => { setFlows((l) => l.filter((f) => f.id !== deleting.id)); setDeleting(null) }}>Delete</Button></>}>
          <ModalText>“{deleting.name}” will be deleted.{deleting.live ? ' It’s on now, so the widget goes back to the pre-chat form, then the AI agent or a person.' : ''} Chats already in it finish as they are.</ModalText>
        </Modal></div>
      )}
    </div>
  )
}

function CreateFlowModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, t: TemplateId) => void }) {
  const [name, setName] = useState('Reason for contact')
  const [t, setT] = useState<TemplateId>('reasonAi')
  return (
    <div className="fb-scrim"><Modal title="Create a flow" width={500} onClose={onClose}
      actions={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" disabled={!name.trim()} onClick={() => onCreate(name.trim(), t)}>Create and edit</Button></>}>
      <Input label="Name" fullWidth value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      <div className="fl-templates" role="radiogroup" aria-label="Start from">
        {templates.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={t === x.id} className={`fl-template${t === x.id ? ' is-selected' : ''}`} onClick={() => setT(x.id)}>
            <ListRadio selected={t === x.id} />
            <div><b>{x.label}</b><span>{x.description}</span></div>
          </button>
        ))}
      </div>
    </Modal></div>
  )
}
