# Powerhouse — Project Context

## Core Concept

Powerhouse builds the operating system for decentralized organizations (DAOs/SNOs). The central primitive is the **document model** — not a data container but a living, executable specification with state, typed operations, and immutable event history.

---

## Architecture Stack

### Document Models

- Structured like GraphQL schemas
- Mutated exclusively through typed **operations/reducers** (no direct writes)
- Every change appended as an immutable event
- Provides CQRS + event sourcing + time-travel debugging by design

### Reactor (Storage Node)

- Runs embedded in every host application
- Syncs documents peer-to-peer via the **DocSync** protocol
- Conflict resolution: replay and "smash" operations
- Storage backends: local, cloud, or decentralized (IPFS/Ceramic)

### Processors

- Listeners that react to document operation streams (`onStrands`)
- Use cases: analytics, reporting, derived read models
- Filter by `branch` / `documentType` / `scope`
- Batch-write to a time-series analytics store; queryable via GraphQL

### Host Applications


| App             | Role                                  |
| --------------- | ------------------------------------- |
| **Connect**     | Contributor workspace                 |
| **Switchboard** | API and analytics engine              |
| **Fusion**      | Public front-end r                    |
| **Renown**      | Decentralized identity and reputation |


---

## AI Integration

### Reactor-MCP

- Model Context Protocol server bridging AI agents into Powerhouse
- Agents read/write documents through structured document model operations

### Document Model Agent

- Specialized AI guiding document model creation
- Pipeline: requirements → schema → operations → code generation

### Specification-Driven Design

- Document models are machine-readable, executable specs
- Positioned as the foundation for **"Git for Intent"** — specifications as shared language between humans and AI agents

### AI Contributor Modes

- Configurable permission states for AI assistants within the contributor system
- Determines task scope and access level per AI participant

---

## Organizational Model

**SNO (Scalable Network Organization)** — next-generation DAO structure composed of five legal/operational entities:


| Entity                 | Function                        |
| ---------------------- | ------------------------------- |
| DAO                    | Governance                      |
| Operational Hub        | Administration                  |
| OCF                    | Treasury + Proof-of-Work Tokens |
| Revenue Generating Hub | Commercial operations           |
| IPSPV                  | IP holding                      |


**Open-Source Capitalism**: make open-source self-sustaining and investable.

---

## Summary

Powerhouse builds programmable, collaborative infrastructure for decentralized organizations. Document models are the unit of coordination — versioned, executable, and AI-addressable.