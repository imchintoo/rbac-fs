---
title: Can file-based RBAC scope what an AI agent touches?
date: 2026-08-24
excerpt: 2026's agent security data says the dominant failure mode is over-permissioning, not model behavior — here's an honest look at where folder-scoped RBAC actually helps, and where it runs out.
tags: ai-agents, security, architecture
---

## The number that reframes the problem

Most of 2026's agentic-AI security coverage has been about prompt injection, hallucinated tool calls, and models doing something nobody asked for. The field data tells a duller, more fixable story. [TierZero's 2026 analysis](https://www.tierzero.ai/blog/ai-agent-security-over-privileged/) traces 61% of reported agent security incidents back to plain over-permissioning — an agent that could do more than its actual job required, not one that was tricked into anything clever. Organizations that grant agents excessive permissions see 4.5x more incidents than the ones that hold the line on least privilege. [Gravitee's State of AI Agent Security 2026 report](https://www.gravitee.io/state-of-ai-agent-security-2026-report-when-adoption-outpaces-control) adds the structural reason why: only 22% of teams give each agent its own distinct identity. The rest run agents on a shared API key or a human's existing credentials, which means the agent's effective permission set is whatever that key can do — usually far more than the agent's actual task requires. [Shattered.io](https://shattered.io/agentic-ai-security-2026/) puts the average cost of an agentic-AI breach at $4.7M.

Read together, those numbers describe an access-control problem, not a model-alignment one. Which raises a fair question for anyone already running file-based RBAC for human users: does the same model hold up for an agent process, or is agent authorization a genuinely different problem that needs genuinely different tooling?

## Agents don't get identities, they get borrowed ones

The 22% figure is the tell. When an agent doesn't have its own identity, nobody has actually decided what it's allowed to do — they've decided what the *key* is allowed to do, and the agent inherits that by default. That's the same failure mode RBAC was invented to fix for human users thirty years ago: don't let access ride on "whoever holds this credential," decide it per role and check it per action.

Nothing about that principle is agent-specific. An agent that summarizes support tickets doesn't need write access to billing records for the same reason a support rep doesn't. The fix in both cases is the same shape: stop granting access by proxy (a shared key, a human's session) and start granting it by role, scoped to exactly what the job requires.

## What a role subject would look like for an agent

Treat the agent as a role subject the same way you'd treat a tenant's admin user, and rbac-fs's existing primitives map onto this cleanly, without inventing anything new:

A dedicated tenant folder per agent deployment (`.rbac/tenants/support-summarizer-agent/`) gives it folder-level isolation from every other tenant and from `_shared/` — a config error in the agent's role file can't leak into another tenant's role space, because the two are separate namespaces at the filesystem level, not rows gated by a `WHERE` clause that a bad query can bypass.

A role scoped to the actual job — `can({ role: 'support-summarizer', action: 'read', resource: 'ticket' })` returns true, the same check for `resource: 'billing-record'` or `action: 'delete'` returns false — with a condition tree doing the fine-grained part: `{ and: [{ eq: ['resource.status', 'closed'] }, { lt: ['resource.ageDays', 90] }] }` lets the agent summarize old, closed tickets without ever being able to touch an open one, expressed declaratively, not hidden in application code where nobody will notice it drifted.

An audit trail that's actually agent-specific. Every `can()` call the agent makes gets appended to `logs/support-summarizer-agent.jsonl` — one line per decision, allow or deny, with the resource and condition inputs that produced it. When an incident review asks "what did this agent actually try to do," the answer isn't reconstructed from application logs after the fact; it's a `grep` against a file that was being written the whole time.

Reserved-name protection and path sanitization apply here exactly as they do for human tenants — an agent's role name still has to match `^[a-zA-Z0-9_-]+$`, and it still can't claim `admin` or `system-admin` without `{ force: true }`, which is one more place a misconfigured agent deployment gets stopped before it does damage rather than after.

None of that requires a new product. It requires treating "agent" as a subject type your existing role model already knows how to constrain, instead of a special case that gets waved through on a shared credential because nobody built the role file for it yet.

## Where it doesn't reach

The honest boundary matters more here than the fit. The [MCP 2026-07-28 authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) names two risks that a static role-and-condition model has nothing to say about. The first is the confused deputy pattern: a server holding broad, ambient authority gets manipulated into acting on a caller's behalf without a per-action check at the point of the call. Fixing that is a protocol and transport-layer problem — OAuth 2.1 flows, scope negotiation in the `WWW-Authenticate` header, a resource server that verifies the token's audience before it acts — not a role file. The second is token passthrough: forwarding an upstream token to a downstream tool call instead of exchanging it per [RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693), which lets a credential scoped for one system reach a system it was never issued for. A role file can describe what an agent *should* be allowed to do; it can't stop a token minted for one purpose from being silently reused for another mid-request.

Step-up authorization is the other gap. MCP's newer spec lets a server negotiate for more scope mid-session when a client requests an operation it wasn't originally granted. rbac-fs's model is static by design — you write the condition tree, the agent's role either satisfies it or doesn't, and there's no mechanism for an agent to request an elevated, time-boxed scope for one operation and have that request evaluated and expire on its own. Capability-chain delegation — one agent handing a narrower, attenuated version of its own authority to a sub-agent it spawns, the way Biscuit tokens or invocation-bound capability tokens are designed to — is the same story: it's a delegation-chain problem that a flat role check doesn't model at all.

So the fair answer isn't "file-based RBAC solves AI agent security" and it isn't "this is a completely different problem with nothing in common." It's narrower than either: a static, session-scoped agent identity with a fixed set of permissions for its lifetime is a role subject rbac-fs already knows how to constrain, audit, and isolate per tenant. An agent that needs to negotiate its own scope mid-session, or delegate a narrower slice of its authority to something it spawns, needs a capability or token-exchange layer that a role file was never built to be.

## Bottom line

The 2026 data says the agent security problem most teams actually have isn't sophisticated — it's that nobody decided what the agent should be allowed to do and wrote it down anywhere. That part, file-based RBAC already solves: give the agent its own tenant folder, a role scoped to its actual job, and an audit log that's genuinely its own. What it won't do is replace an OAuth-based protocol layer for agent-to-agent delegation, and pretending otherwise would be the same category of over-permissioning mistake the data is describing in the first place.

```bash
npm install rbac-fs
```

Docs at [imchintoo.github.io/rbac-fs](https://imchintoo.github.io/rbac-fs/), package on [npm](https://www.npmjs.com/package/rbac-fs), source on [GitHub](https://github.com/imchintoo/rbac-fs).
