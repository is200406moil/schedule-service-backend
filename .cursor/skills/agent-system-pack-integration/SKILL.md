---
name: agent-system-pack-integration
description: >-
  Integrates the Agent System Pack into the repository by executing the canonical
  workflow in agent-system-pack/integration-prompt.md (Steps 0–10): domain
  analysis, root AGENTS.md from the pack template, six core agents in
  .cursor/agents/, domain write agents, optional catalog agents, .cursor/memory/,
  and .cursor/rules/. Use when the user asks to integrate agent-system-pack,
  run integration-prompt.md, install pack agents/orchestrator, or set up the
  AGENTS.md protocol and persistent memory for this project.
---

# Agent System Pack — Cursor integration

## Mandatory first read

Before changing anything, read **the entire** [agent-system-pack/integration-prompt.md](../../../agent-system-pack/integration-prompt.md) and follow it **in order**. Do not skip, merge, or reorder steps. That file is the source of truth for copy targets, checklists, and the final user report (including language detection).

## Context (read if not already loaded)

1. [agent-system-pack/README.md](../../../agent-system-pack/README.md) — architecture and folder map.
2. [agent-system-pack/AGENTS.md](../../../agent-system-pack/AGENTS.md) — orchestrator **template** only; the deliverable is a **new** domain-specific `AGENTS.md` in the **project root**.

## What you produce (summary)

| Step (see integration-prompt) | Outcome |
|-------------------------------|---------|
| 0 | Empty vs existing project; if empty, ask domain/stack and wait. |
| 1–2 | Understand pack + deep-analyze this codebase (or user description). |
| 3 | Root `AGENTS.md` (150+ lines, **all** sections from template, domain-specific). |
| 4 | Copy six core agents from `agent-system-pack/agents/core/` → `.cursor/agents/`; **adapt** `bg-regression-runner.md` commands. |
| 5 | 2–5 write agents from `agent-system-pack/agents/templates/` → `.cursor/agents/`, update routing in `AGENTS.md`. |
| 6 | Optional: pick from `agent-system-pack/agents/catalog/` per project needs. |
| 7 | Copy `agent-system-pack/memory/` → `.cursor/memory/`; fill `session-handoff.md`. |
| 8 | `.cursor/rules/protocol-enforcement.mdc` + `project-domain-rules.mdc` (`alwaysApply: true`). |
| 9 | Run the verification checklist in integration-prompt; fix failures. |
| 10 | Report using the exact templates in integration-prompt (Russian vs English). |

## Path conventions

- Pack lives at **`agent-system-pack/`** relative to the repository root (same level as the future root `AGENTS.md`).
- Use forward slashes in instructions and generated files.

## After integration

Tell the user to **start a new chat** for the first real task so rules apply cleanly; repeat if integration-prompt says so.
