# agents/

Prompt sources for this project's agent hosts (compiled by
`ph run assistant build`):

- `agent-profiles/` — profile sections, concatenated per profiles.json
- `skills-tpl/<skill>/` — Handlebars skill templates → SKILL.md + references
- `skills-ext/<skill>/` — external skills copied as-is
- `profiles.json` — which profiles to build: [{ "name", "sections": [...] }]

Output lands in `dist/skills/`.
