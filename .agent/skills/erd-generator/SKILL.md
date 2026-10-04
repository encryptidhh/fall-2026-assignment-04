---

name: erd-generator
description: >-
Converts natural-language domain requirements into a verified Mermaid ERD and a
rendered physical SVG diagram. Trigger this skill when the user asks to design
an ERD, entity-relationship diagram, data model, database schema, or
architecture diagram, or to convert requirements into a Mermaid diagram.

---

# ERD Generator

Turns domain requirements into a validated Mermaid `erDiagram` and a physical
SVG artifact at `docs/architecture/erd.svg`, with automatic syntax-error
recovery.

## Workflow

### 1. Parse the domain requirements

Extract from the user's description:

- **Entities** — nouns holding persistent data (e.g., `CUSTOMER`, `ORDER`).
- **Attributes** — fields per entity; identify the **primary key (PK)** and
any **foreign keys (FK)**.
- **Relationships & cardinalities** — decide direction and multiplicity:
- `||--||` exactly one to exactly one
- `||--o{` one to zero-or-many (one-to-many)
- `}o--o{` many-to-many (resolve with an associative entity when the
relationship itself carries attributes)
- `o` = zero, `|` = one, `{` / `}` = many
- **Relationship attributes** — e.g., `CONTAINS` may carry `quantity`.

If requirements are ambiguous, choose the most conventional interpretation
and state the assumption in chat. Never invent entities unsupported by the
requirements.

### 2. Draft the Mermaid syntax

Write the drafted `erDiagram` **directly** to `docs/architecture/schema.mmd`.
Rules:

- First line must be `erDiagram`.
- Entity names: `UPPER_SNAKE_CASE`; attribute names: `snake_case`.
- Every attribute line: `type name PK|FK "comment"` — mark PK and FK
explicitly; add a comment clarifying the FK target (e.g., `"FK -> CUSTOMER"`).
- Keep the diagram deterministic: stable entity order, consistent attribute
ordering (PK first, then FKs, then plain attributes).

### 3. Render & validate

Execute:

```javascript
node scripts/render_erd.js docs/architecture/schema.mmd
```

- `SUCCESS` (exit 0) → artifact written to `docs/architecture/erd.svg`.
- `SYNTAX_ERROR: <trace>` (exit 1) → the Mermaid was invalid.

### 4. Self-correction loop

If the run fails with `SYNTAX_ERROR`:

1. Parse the error trace. Typical causes: unsupported attribute type, invalid
crow's-foot syntax, duplicate entity names, stray/unicode characters,
missing `erDiagram` header.
2. Patch **only** the offending lines in `docs/architecture/schema.mmd`.
3. Re-run step 3.

Maximum **3 retries**. If still failing after 3 attempts, stop guessing: show
the user the failing Mermaid block and the error trace, and ask for
clarification.

### 5. Final output

- Present the raw Mermaid block to the user in a fenced ```` ```mermaid ````
code block.
- Reference the generated image asset path: `docs/architecture/erd.svg`.

## Files

| Path | Role |
| --- | --- |
| `scripts/render_erd.js` | CLI validator/compiler wrapping `mmdc` (`npx mmdc` fallback) |
| `docs/architecture/schema.mmd` | Mermaid source — single source of truth |
| `docs/architecture/erd.svg` | Rendered physical diagram — never hand-edited |

## Operational constraints

- `erd.svg` is always regenerated from `schema.mmd`; never edit it by hand.
- Keep `schema.mmd` under version control.
- mermaid-cli renders with headless Chromium; `render_erd.js` auto-applies
`--no-sandbox` so it works in CI/containers.
- Do not exceed 3 self-correction retries; escalate to the user instead.
