name: kysely-migration-generator
description: >-
Translates a Mermaid ERD (typically docs/architecture/schema.mmd produced by
the erd-generator skill) into a type-safe Kysely database migration. Trigger
this skill when the user asks to generate a database migration, DDL, or
schema from an ERD, data model, or architecture diagram, or to keep the
database schema in sync with a Mermaid erDiagram.

---

# Kysely Migration Generator

Consumes a Mermaid `erDiagram` and emits a complete, type-safe Kysely
migration at `src/db/migrations/<timestamp>_<migration_name>.ts`.

## Input contract

- Read the Mermaid source (default: `docs/architecture/schema.mmd`).
- Parse **entities**, **attributes** (with `PK` / `FK` markers and comments),
and **relationship lines** (`||--o{`, `||--o|`, `}o--o{`, etc.).
- If the ERD was produced by the `erd-generator` skill, FK comments of the
form `"FK -> ENTITY"` identify the referenced table directly. Otherwise
resolve FK targets from the relationship lines.

## Translation rules (guardrails)

### 1. Entities → tables

- Map each entity to a **snake_case** table name: `CUSTOMER` → `customers`,
`ORDER_ITEM` → `order_items`, `USERS` → `users`.
- Pluralize simple nouns; keep established conventions (`USER` → `users`).

### 2. Keys & columns

- **PK attributes** become auto-generating primary keys:
- `id` → `.addColumn('id', 'serial', (c) => c.primaryKey())`, or
- `uuid` PKs → `'uuid'` with a generated default
(`.defaultTo(sql`gen_random_uuid()`)`).
- Never leave a PK without an auto-generation strategy.
- **FK attributes** become:
`.addColumn('<fk>', '<type>', (c) => c.references('<pk>').inTable('<table>').onDelete('cascade'))`
- **The FK column type must exactly match the referenced PK column type.**
- `onDelete('cascade')` is mandatory for every FK.
- Non-key attributes map by Mermaid type:
`string`→`varchar(255)` (or `text` if marked long), `int`→`integer`,
`decimal`→`numeric(10,2)`, `float`→`double precision`,
`boolean`→`boolean`, `datetime`/`timestamp`→`timestamptz`,
`date`→`date`, `json`→`jsonb`, `uuid`→`uuid`. Unknown types: **stop and
ask**, do not silently default.

### 3. Cardinalities → constraints

| Mermaid | Meaning | Schema effect |
| --- | --- | --- |
| `A \\|\\|--o{ B` | one-to-many | FK lives on `B`; plain index; no unique |
| `A \\|\\|--\\|{ B` | one-to-many (total) | FK on `B`, `notNull()` |
| `A \\|\\|--o\\| B` | one-to-zero-or-one | FK on `B` **plus `.unique()`** on the FK column |
| `A \\|\\|--\\|\\| B` | exactly one-to-one | FK on `B`, `notNull()` **plus `.unique()`** |
| `A }o--o{ B` | many-to-many | associative table `a_b` with two FKs + composite PK |

- The FK always lives on the **many** side; the FK column name is
`<referenced_table_singular>_id` unless the attribute already declares one.

### 4. File output

- Write to `src/db/migrations/<timestamp>_<migration_name>.ts`.
- `<timestamp>`: 14-digit UTC `YYYYMMDDHHMMSS`, lexicographically sortable.
- `<migration_name>`: snake_case verb phrase describing the change
(e.g., `001_initial_schema` style in the starter repo; name new ones like
`20261004093000_add_order_items`).

### 5. Required structure

Both functions must be exported with **exactly** these signatures:

```ts
export async function up(db: Kysely<any>): Promise<void> { ... }
export async function down(db: Kysely<any>): Promise<void> { ... }
```

- `up`: `createTable` in **dependency order** (referenced tables first).
- `down`: `dropTable` in **strict reverse dependency order** (dependent
tables first, leaf-most table last).
- One migration per ERD revision; never edit an already-applied migration —
generate a new one.

## Self-check before finishing

1. Every entity from the ERD has exactly one `createTable`.
2. Every FK has `references(...).inTable(...).onDelete('cascade')` and a type
matching its referenced PK.
3. Every one-to-one relationship produced a `.unique()` constraint.
4. `down` drop order is the exact reverse of `up` create order.
5. File name matches `<14-digit timestamp>_<snake_case_name>.ts` and both
`up`/`down` are exported with the required signatures.
6. Present the migration to the user in a fenced ```ts block and reference
the file path `src/db/migrations/<timestamp>_<migration_name>.ts`.
