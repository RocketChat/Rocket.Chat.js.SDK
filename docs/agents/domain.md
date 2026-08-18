# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## ADRs are rewritten in place

An ADR always reads as the current decision. When a decision evolves, rewrite the ADR itself — no amendment or changelog sections. The PR that changed it is the record of why; a PR that rewrites ADRs names them in `## Proposed changes`.

The one exception is a reversal. When a decision is reversed, don't rewrite the old ADR: write a new one that supersedes it, and flip the old ADR's status line to `**Status:** Superseded by ADR-NNNN` (zero-padded, matching the ADR titles). Nothing else in the old file changes. The new ADR and the status flip land in the same PR as the change that prompted them.

A rewrite is a reversal when its new text makes false a claim that another in-force ADR states. Anything else is an evolution, however much of the file changes.

Don't confuse this with the `**Succeeds:** ADR-NNNN` line some ADRs carry. `Succeeds` chains ADRs that build on each other while both stay in force; `Superseded by` marks a decision that no longer applies. A superseding ADR can also carry a `Succeeds` line pointing at the one it replaces.

### Before rewriting, find who cites you

Grep `docs/adr/` for the ADR's own number before you rewrite it. Every ADR that cites it is in scope of the same change: re-read each one against the new text, and rewrite the ones the change made stale in the same PR. This is also how you answer the reversal question above — if a citing ADR's claim is now false, you owe a new ADR rather than a rewrite.

```
grep -rn "ADR-0003" docs/adr/
```

### Two statuses, and no others

`**Status:** Accepted` and `**Status:** Superseded by ADR-NNNN` are the whole vocabulary. Don't invent `Proposed`, `Draft` or `Deprecated` — a decision that isn't accepted yet isn't an ADR yet.

### Decisions, not rollouts

An ADR records the decision and what it costs. Sequencing — which PR lands first, what pins move when — is state, and stale state inside a document that reads as current is the fault this convention exists to prevent. Rollout plans and open questions live in the issue or the PR. If the sequencing is itself decided, one sentence in Consequences carries it.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
