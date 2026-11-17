# Product Spec: Chat Flows in Omni

Source: https://hiverhq.atlassian.net/wiki/spaces/PRODUCT/pages/2462613540/Product+Spec+Chat+Flows+in+Omni (Confluence, last modified 12 Nov 2026). Copied 16 Nov 2026.

## Part 1: The Brief

### 1. Problem Statement

Today, a chat in Omni starts with a short pre-chat form (name, and optionally email and phone), then goes to the AI agent or straight to a person. There's no guided step in between: no "what can we help with?", no follow-up questions, and no way to send the chat somewhere based on the answers. Omni had a chatbot builder, ported from HIG but it was hidden when the AI agent launched.

Teams moving from Intercom, Front or Zendesk expect that guided step. They're used to chat starting with a few buttons and questions, then reaching the right person or the AI agent.

Take a company that installs equipment for homeowners and contractors. A homeowner and a contractor need different questions asked, and billing questions need to go to finance. On Omni, every visitor gets the same three-field form, then lands in one queue. Someone reads each chat and moves it by hand.

**Every visitor gets the same questions.** The pre-chat form has three fixed fields. For example, a team can't ask a contractor for their account number and a homeowner for their address. Agents ask in the chat instead, and the visitor waits.

**Chats can't be sent to the right people from the answers.** Chats go to the unassigned queue or round robin across everyone in the inbox, whatever they're about. For example, a visitor who says "billing" still lands with whoever is next, who passes it to finance by hand.

**Teams can't keep some chats away from the AI agent.** The AI agent decides on its own when to hand over. For example, Hiver's own support wants billing questions and accounts above about $1,000 MRR to skip the AI agent and go straight to a person. Today there's no way to set that as a rule.

In one sentence: Omni chat has no guided start, so teams can't ask the right questions, route on the answers or decide which chats the AI agent handles.

### 2. Use Cases

- **A visitor picks a reason.** A contractor opens chat and picks "Existing project". He's asked two questions that only contractors get, then reaches one of the agents who handle projects. Today he gets the same form as everyone and waits in one queue.
- **Billing goes to finance.** A visitor picks "Billing". The chat skips the AI agent and goes to one of the agents who handle billing. Today it lands in the general queue.
- **Big accounts skip the AI agent.** Rahul, the support admin, wants logged-in customers on high-value plans to reach a person straight away. Today the AI agent answers everyone first.
- **An agent picks up a routed chat.** Priya, who handles projects, opens a chat and sees what the visitor picked and answered before she says hello. Today she starts by asking.
- **An admin checks how the flow is doing.** Rahul wants to see where visitors drop out and how many chats the flow, the AI agent and people each resolve. Today there's no report.

### 3. Business Sense

This is about winning deals against Intercom and Front, where Omni chat is losing on a feature those tools treat as standard.

- **Strategic fit:** Omni already has the AI chat agent and logged-in visitors on the widget. A guided start ties them together: the flow decides who gets the AI agent, and every handover reaches the right person with context.
- **Market segment:** Teams moving from Intercom, Front or Zendesk that run website or in-app chat, especially larger deals.
- **Evidence:** Install Partners ($800 MRR, leaving Intercom) asked for chat questions that change by visitor, with routing on the answers. They chose Front on 12 October 2026 because of Front's chat branching. Sales reports that guided chat flows come up more and more on bigger deals against Intercom. Pet Desk ($3k MRR, on Zendesk, renewing in February) wants in-product AI chat that hands what it can't resolve to a person. Hiver's own support wants reason selection and rules to keep some chats away from the AI agent. Appendix A has the detail.
- **Why now:** Acquisition, not retention. Only about 7 accounts use Omni chat today, so the opportunity is in new deals, and the gap is costing us Intercom-displacement deals now. The builder already exists, hidden, which keeps this a relaunch rather than a new build.

### 4. Goal

Admins can give chat a guided start that asks the right questions, routes on the answers and decides which chats go to the AI agent, with every handover reaching the right person with context.

### 5. Success Metric

No Omni deal is lost where guided chat flows are the stated reason, from the first full quarter after launch. This is read from HubSpot deal reviews each quarter.

- Alongside it, we track how many accounts with chat turn on a flow, and the share of chats resolved by the flow, the AI agent and people. There's no baseline yet, so these are tracked, not targeted.

### 6. Scope Summary

A guided intake that runs before the AI agent and live chat, built on the chatbot builder Omni already has. It's a short intake, not a full automation builder or a web form inside chat.

- Admins can turn on chat flows for a chat widget and start from two templates: "Reason for contact, then AI agent, then a person" and "Reason for contact, then a person". Most teams need one of these two shapes.
- Flows can show messages, offer buttons, ask questions and branch on the answers. This is the guided step teams expect.
- Admins can optionally save any answer to a contact or chat custom field, so it's kept for reports and later automations. The pre-chat form stays as it is.
- A flow can assign the chat based on the visitor's answers, either to one chosen agent or by round robin among a set of agents the admin picks. Round robin runs only among the selected agents, not everyone in the inbox, so billing chats reach only the people who handle billing. Routing works on the answers themselves, so admins don't have to set up custom fields first.
- A flow can branch on what Omni already knows about the visitor, such as plan, MRR or logged-in details, so teams can keep chosen customers away from the AI agent.
- A flow can hand the chat to the AI agent with the answers as context. If the AI agent hands over, the chat goes to the agent or agents chosen for that branch, not the unassigned queue.
- Agents see the visitor's answers and the path they took at the top of the chat, so nobody asks twice.
- When the team is offline, the flow's answers become a conversation in unassigned, so the request isn't lost.
- Reports/Analytics show how many visitors start, finish and drop out of each flow, and whether each chat was resolved by the flow, the AI agent or a person.

Left out, for now:

- A full Intercom-style builder with API calls from flows. Install Partners needed branching and routing, not integrations.
- Proactive messages, pop-ups and email campaigns. These are marketing tools, and nobody in the requests asked for them.
- New fields in the pre-chat form. Questions are asked as flow steps instead, which covers the same need without a second form to maintain.

---

## Part 2: Additional Details

### 7. User Stories

#### Admin: turn on chat flows

**As an admin, I want to** turn on a chat flow for a chat widget, **so that** visitors get a guided start.

- Chat flows appear in admin settings under Chat. Only admins can create, edit, turn on or turn off flows.
- Each chat widget can have one active flow at a time, so visitors always get a predictable start.
- Creating a flow offers the two templates or a blank flow.
- A flow can be saved as a draft and turned on later. Turning it on takes effect for chats that start after that moment.
- Turning a flow off returns the widget to today's behaviour: pre-chat form, then the AI agent or a person.

#### Admin: build a flow

**As an admin, I want to** build a flow from simple steps, **so that** visitors are asked the right questions and reach the right place.

- Steps available: message, buttons (2 to 8 options, each starting its own branch), question (free text), condition, AI agent, assign and end.
- Every branch must end in an AI agent step, an assign step or an end step. Omni won't let an admin turn on a flow with a branch that leads nowhere, and points to the branch that needs an ending.
- A question or button answer can optionally be saved to a contact or chat custom field of a matching type. Text answers save to text fields; button answers save to text or dropdown fields with matching options.
- The condition step branches on contact or account details Omni already holds: logged-in visitor details, plan, MRR, and contact or account custom fields. Each condition can be "is", "is not", "is greater than" or "is less than", depending on the field type.
- The assign step offers two choices: "One agent", where the admin picks a single agent, or "Round robin", where the admin multi-selects agents from the inbox's agents. It doesn't need a custom field.
- With round robin, chats on that branch rotate only among the selected agents, skipping anyone away or offline, the same way inbox round robin treats availability today. Agents in the inbox who aren't selected never receive these chats.
- The AI agent step hands the chat to the AI agent with the flow's answers as context. The admin chooses where it goes if the AI agent hands over: one agent, round robin among selected agents, or the unassigned queue.
- If the AI agent isn't set up for the account, the AI agent step isn't offered.

#### Visitor: go through the flow

**As a website visitor, I want** a few quick steps that get me to the right help, **so that** I don't repeat myself or wait in the wrong queue.

- The flow starts when the visitor opens chat and the pre-chat form, if any, is done. Logged-in visitors skip details Omni already has.
- Button steps show the options as buttons. The visitor can also type, and typed text that matches an option counts as picking it.
- Question steps wait for the visitor's reply before moving on.
- A returning visitor with an open chat continues that chat; the flow doesn't start again.

#### Agent: pick up a routed chat

**As an agent, I want to** see what the visitor answered before I reply, **so that** I can help straight away.

- The top of the chat shows the flow name, the path taken and each answer, for example "Reason: Billing · Account number: 48213".
- If the AI agent handled the chat before handing over, its summary appears below the flow answers.
- Chats assigned by a flow land in the assigned agent's queue, not in Unassigned. With round robin, that's the agent round robin picked.
- The chat's activity shows "Assigned to [agent] by [flow name]", with "(round robin)" when it was picked that way.

#### Admin: see how flows perform

**As an admin, I want to** see how each flow performs, **so that** I can fix where visitors drop out.

- Chat analytics show, per flow and per branch: chats started, completed, dropped and handed to a person.
- Every chat records who resolved it: the flow, the AI agent or a person. Chat analytics can be filtered by it.
- Saved custom field values can be used in existing chat reports and filters.

### 8. Edge Cases

- **Outside business hours.** The flow's answers become a conversation in Unassigned, so whoever is first in the next morning picks it up with the answers attached.
- **Within hours, but none of the selected round robin agents is available.** The chat goes to Unassigned.
- **The single chosen agent is away.** The chat goes to their queue all the same. Admins who want coverage use round robin with several agents instead.
- **The visitor leaves mid-flow.** The chat closes as abandoned after the widget's usual inactivity time, and counts as dropped at the step where the visitor stopped.
- **The visitor types something that matches no button.** The flow repeats the options once. If the next reply doesn't match either, the chat follows the "anything else" branch, or goes to the unassigned queue if there's none.
- **A condition uses a detail the visitor doesn't have** (e.g. MRR for an anonymous visitor). The condition counts as not met, and the flow follows the "otherwise" branch.
- **A mapped custom field is deleted or its options change.** The flow keeps running; the answer is still shown to the agent but isn't saved. The flow editor marks the step.
- **The admin edits a flow while chats are in it.** Chats already in the flow finish on the version they started with.
- **A selected agent is removed from Omni or from the inbox.** Round robin carries on among the remaining selected agents. If none remain, or the single chosen agent is removed, chats go to Unassigned and the flow editor marks the step.
- **The AI agent is turned off after a flow uses it.** The AI agent step is skipped and the chat goes to its handover target.

### 9. Non-Functional Requirements

- **Speed:** each step responds instantly. A flow should feel faster than typing to a person.
- **Reliability:** if a flow fails partway, the chat falls back to today's behaviour and reaches the unassigned queue.
- **Fair rotation:** round robin among selected agents spreads chats evenly, independent of any other branch or the inbox's own round robin.
- **Safety of changes:** turning on, editing or turning off a flow never affects chats already in progress.
- **Privacy:** answers are stored with the chat and contact like any other chat message, with the same access rules.
- **Accessibility:** every step can be completed by keyboard, and buttons can also be answered by typing.

### 10. Frontend Events

| Event | Fires when | Properties |
| --- | --- | --- |
| ChatFlowCreated | An admin saves a new flow | Started from (template name or blank) |
| ChatFlowActivated | An admin turns a flow on for a widget | Number of steps, uses AI agent, uses condition, uses field mapping, assign types used |
| ChatFlowDeactivated | An admin turns a flow off | Days active |
| ChatFlowStarted | A visitor sees the first step of a flow | Flow, logged-in visitor or not |
| ChatFlowOptionSelected | A visitor picks a button option | Flow, step, option |
| ChatFlowCompleted | A visitor reaches an AI agent, assign or end step | Flow, ending type |
| ChatFlowAnswersViewed | An agent expands the flow answers in a chat | Channel inbox |

### 11. Rollout & Migration

- **First:** Hiver's own support. **Then:** early access for Omni chat accounts and open deals against Intercom/Front, including Pet Desk. **Then:** all Omni accounts with chat.
- **Existing widgets:** every Omni chat widget already has a hidden default bot. These stay off until an admin turns a flow on.
- **Monitor:** flows activated, drop-off by step, chats sent to Unassigned because no selected agent was available, and fallbacks from failed steps.
- **Rollback:** per-account flag. Switching it off returns every widget to today's behaviour; saved custom field values stay.

### 12. Playground Activity

**Title:** Build a chat flow that routes billing to the right people

1. In admin settings → Chat, create a chat flow from the "Reason for contact, then a person" template.
2. Edit the buttons to "Billing" and "Product question".
3. On Billing, add a question for the account number, save it to a chat custom field, and end with an assign step set to "One agent" (yourself).
4. On Product question, add an AI agent step that hands over to the unassigned queue.
5. Turn the flow on for your Playground chat widget.
6. Open the widget as a visitor, pick "Billing" and enter an account number.
7. Back in Omni, open the chat from your own queue.
8. It worked if the chat is in your queue, the top of the chat shows "Billing" and the account number, and the custom field holds the number.

### 13. Known Limitations & Future Considerations

- One active flow per chat widget.
- Routing picks agents one by one; teams could come later.
- No API calls from flows.
- No proactive messages, pop-ups or email campaigns.
- Chat isn't in automations yet, so saved custom fields can't trigger automations.
- Later: flows on WhatsApp, and flows that call other systems.

---

## Appendix A: Who's Asking

| Company | Type | MRR | What they asked for | Solved? |
| --- | --- | --- | --- | --- |
| Install Partners | Lost deal, chose Front on 12 Oct 2026 | $800 (lost) | Chat questions that change by visitor, with routing on answers | Yes |
| Pet Desk | Prospect on Zendesk, renewing Feb | Est. $3k | In-product AI chat that hands the rest to a person | Partly |
| Hiver (own support) | Internal | — | Reason selection, billing straight to finance, accounts > ~$1,000 MRR kept from AI agent | Yes |

## Appendix B: Competitor Review (Nov 2026)

| Competitor | Supported? | How it works |
| --- | --- | --- |
| Intercom | Yes | Workflows with buttons/branches; Fin is a step inside the workflow; escalation rules on attributes |
| Zendesk | Yes | Scripted dialogues inside the AI agent builder, generative step inside dialogues |
| Freshworks | Yes | Separate bot builder and AI agent sharing session data; handover assigns a group |
| Front | Partly | Legacy branching chatbots; moving to AI-first Resolve |
| Gorgias | Yes | Up to 6 flows run first; AI agent takes over when the visitor asks for more help |
| HubSpot | Yes | Rule-based chatbots with a "send to customer agent" action |

Takeaways: a guided start before the AI agent is table stakes; most competitors put the AI agent inside the flow as a step (the model this spec follows); answers carried to the agent at the top of the chat is standard; Omni can keep both rules and AI.
