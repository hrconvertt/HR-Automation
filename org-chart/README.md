# Convertt — Org Hierarchy Tool

Self-contained, editable org chart for Convertt. Two files, no build, no external dependencies.

```
org-chart/
├── org-data.json    ← canonical source of truth (push this to your websocket)
├── org-editor.html  ← single-file, vanilla JS editor (open directly in browser)
└── README.md        ← this file
```

## Quick start

1. Open `org-editor.html` directly in any modern browser (no server needed).
2. The tree loads with the current Convertt roster, gaps filled, conflicts flagged.
3. Edit / add / delete / drag-to-reparent nodes.
4. **Download JSON** to overwrite `org-data.json`.
5. Wire your websocket inside `pushToSocket()` and click **Push to Websocket**.

## JSON schema (each node)

```ts
{
  id: string,            // stable unique slug (e.g. "iqra", "head-fin-vacant")
  name: string,          // person's name OR "VACANT" for placeholders
  title: string,         // job title
  department: string,    // department label (free text; group by this)
  status: "active" | "placeholder" | "vacant",
  conflict: boolean,     // true when role is ambiguous/duplicate
  note?: string,         // optional reason (gap/conflict explanation)
  parentId: string | null, // null only for root (CEO)
  children: Node[]       // nested for rendering; omit for flat/relational consumers
}
```

- **Root** = CEO. `parentId = null`.
- **Every node has exactly one parent.** No orphans, ever — gaps are filled with placeholders.
- **`status`:**
  - `active` — a real person
  - `placeholder` — an inferred missing role (e.g. "Head of Finance — VACANT")
  - `vacant` — an explicitly empty seat (synonymous; use whichever fits the conversation)
- **`conflict: true`** — two or more people hold the same role / there's an ambiguous reporting line. The editor highlights these in warning red so you can resolve them manually.

### Nested vs flat

The file ships in **nested tree form** (with `children[]`). For consumers that prefer a relational shape (websocket/sql), call:

```js
flattenForSocket(tree) // returns Array<{ id, parentId, name, title, department, status, conflict, note }>
```

This flattens the tree to ID-pair rows, drops `children[]`, retains every node. `parentId` is the single source of truth for reporting line.

## How the editor infers the hierarchy

The initial JSON is hand-built from your roster, with these rules applied:

| Title pattern | Where it lands |
|---|---|
| `CEO`, `Co-Founder` | Top of tree (C-level) |
| `Head of …` | Reports to a C-level |
| `Lead`, `Senior` | Reports to the relevant Head |
| `Associate …`, `Junior …`, `Intern`, base titles | Reports to the Lead/Senior of their dept |

If a department has staff but no Head/Lead → a **placeholder** is inserted (dashed border).
If a senior role logically must exist (e.g. CTO above several tech depts) → also a placeholder.
If two people hold the same Head role → both flagged with **`conflict: true`** (warning red).

## Editor controls

| Action | How |
|---|---|
| Add person under a node | Hover node → **＋** button OR Add Person toolbar |
| Edit a node | Double-click OR **✎** button |
| Delete a node | **✕** button (reports get reattached to the parent) |
| Re-parent | Drag a node card onto another |
| Collapse/expand | The small toggle to the left of any parent |
| Add placeholder | "+ Placeholder" toolbar button (asks for parent id) |
| Flag a conflict | Edit modal → check "Flag as conflict" |
| Add a note | Edit modal → "Note" textarea (shows as a yellow chip on the card) |
| Export | "Download JSON" (saves `org-data.json`) |
| Copy | "Copy JSON" (clipboard) |
| Import | "Import JSON" → pick a file (replaces current tree) |
| View JSON | "View JSON" toolbar button → bottom panel with live JSON |
| Push to websocket | Toolbar → calls `pushToSocket()` stub — wire your endpoint inside the file |

## Visual legend

| Style | Meaning |
|---|---|
| Solid green-outlined card | Active person |
| Dashed gray-outlined card, italic name "VACANT" | Placeholder / vacant role |
| Red/orange card + "⚠ DUPLICATE" badge | Conflict — needs resolution |
| Yellow chip next to a card | Free-text note (hover for full text) |

## Known issues already flagged in the seed data

1. **Conflict — "Head of Client Servicing & Operations"** held by both Atta Ur Rehman (Web - Shopify) and Muhammad Waqas Fareed (Operations / Client Servicing). The editor highlights both in red. Resolve by renaming one of the titles (e.g. one is "Head of Engineering", the other "Head of Client Servicing"), then uncheck their `conflict` flag.

2. **Placeholders inserted** for: Head of Finance, Head of Human Resource, Head of Marketing & Media, CTO / Head of Engineering. Fill these as you hire — replace the placeholder by editing the node (set Status = active and put the real name).

3. **Aqib Aslam** is the sole WordPress developer. He's currently parked under the CTO placeholder. Re-parent when you decide the structure.

## Websocket contract

```ts
type OrgEvent =
  | { type: 'full_sync', tree: Node }         // entire tree
  | { type: 'node_upsert', node: Omit<Node,'children'> }  // single node
  | { type: 'node_delete', id: string }
  | { type: 'node_reparent', id: string, newParentId: string }
```

The editor currently pushes a full sync (whole tree). Switch to deltas later if the team is large enough to make that meaningful (>200 people).

## Wiring `pushToSocket()`

Inside `org-editor.html`, find:

```js
function pushToSocket(data, url) { ... }
```

Replace the stub body with your transport. Two common patterns:

**HTTP POST:**
```js
return fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
})
```

**WebSocket:**
```js
const ws = new WebSocket(url)
return new Promise((resolve, reject) => {
  ws.onopen = () => { ws.send(JSON.stringify(data)); ws.close(); resolve() }
  ws.onerror = reject
})
```

Then set the `url` in the button handler at the bottom of the script:

```js
const url = 'wss://yourdomain.com/ws/org'   // <-- your endpoint here
```

That's it. Toolbar → Push to Websocket → live.
