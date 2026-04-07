# Initiative Pipeline & Readiness Visualization

**Date:** 2026-04-07
**Status:** Approved
**Scope:** New pipeline view, themes table enhancements, auto-scoring, dependency DAG

---

## 1. Status Model

Every initiative gets a computed readiness status based on dependency data and manual overrides.

### Statuses (pipeline order)

| Status | Determination | Badge Color |
|--------|--------------|-------------|
| **Blocked** | Has `blocked_by` entries where the blocking theme is not marked "Done" | Red (`--red`) |
| **Ready** | All blockers resolved (or none exist) + score exists | Green (`--green`) |
| **In Progress** | Manually toggled by user | Blue (`--blue`) |
| **Done** | Manually toggled by user | Charcoal (`--charcoal`) with checkmark |

### Computation Logic

```
function computeStatus(themeId, visited = new Set()):
  if visited.has(themeId) → return 'ready'  // break cycles
  visited.add(themeId)
  
  if STATE.initiativeStatus[themeId] === 'done' → return 'done'
  if STATE.initiativeStatus[themeId] === 'in_progress' → return 'in_progress'
  
  blockers = STATE.projectDocs[themeId].value.blocked_by || []
  for each blockerName in blockers:
    blockerTheme = find theme by name
    if blockerTheme and computeStatus(blockerTheme.id, visited) !== 'done':
      return 'blocked'
  
  return 'ready'
```

### Manual Toggle

- Available on kanban cards and project page headers
- Cycles: Ready → In Progress → Done → Ready
- Cannot mark a blocked item as In Progress (button disabled)
- Persisted in `sessionStorage` under key `initiative_status` as `{ [themeId]: 'in_progress' | 'done' }`

---

## 2. Auto-Scoring

When the user clicks "Generate All Project Docs" on any theme, business case scores are automatically generated for ALL unscored themes.

### Trigger

Two parallel operations on first doc generation:

1. **Full generation** for the clicked theme — all 7 artifacts (prep, value, brief, roadmap, security, pipeline, process)
2. **Value-only batch** for all other unscored themes — lightweight prompt requesting only the business case JSON

### Value-Only Prompt

New function `generateValueOnly(topicId)`:

- Inputs: theme name, description, search phrases, other theme names (for blocks/blocked_by), firm policies (truncated to 1500 chars), related meeting summaries (truncated to 2000 chars)
- Output: only the `value` JSON object (score, effort, confidence, rationales, blocks, blocked_by, research, roi_estimate, risks_of_inaction)
- ~60% smaller than the full prompt

### Execution

- Value-only calls run through `runPool(tasks, 3)` — max 3 concurrent, retry on 429 with exponential backoff
- Progress shown in themes table area: "Scoring 3/8 themes..."
- Once all scores land, readiness is computed and themes table + pipeline view re-render

### Persistence

- Scores: `sessionStorage` under `project_docs` (existing mechanism)
- Manual statuses: `sessionStorage` under `initiative_status` (new)

---

## 3. Themes Table Enhancements

### New Column: Readiness

- Position: after the color bar column, before Theme name
- Sortable
- Renders status badge (colored pill with text: "Blocked", "Ready", "In Progress", "Done")
- Sort order when sorting by Readiness: Blocked → Ready → In Progress → Done. Secondary sort: ICE descending.

### Enhanced Dependencies Column

- Each blocker name is a clickable link → navigates to that theme's project page
- Unresolved blockers: red text with warning icon
- Resolved blockers (theme marked Done): green checkmark + strikethrough text

### Category Header Readiness Summary

Category rows show a text summary of readiness breakdown:
- Example: "2 blocked, 3 ready, 1 in progress"
- Text only, no numbered badges
- Muted style, appended after theme count

---

## 4. Pipeline View (New Sidebar Page)

New top-level sidebar item: **"Initiative Pipeline"** — positioned between Themes Index and Knowledge Graph.

### 4a. Kanban Board (Top Section)

Four columns: **Blocked | Ready | In Progress | Done**

**Column header:** Column name + count in parentheses, e.g., "Ready (4)"

**Initiative cards show:**
- Left edge: theme color bar
- Theme name (bold, clickable → project page)
- ICE score badge
- Category label (small, muted text)
- **Blocked column:** list of unresolved blocker names as red pills, each clickable → blocker's project page
- **Ready column:** "Start" button → toggles to In Progress
- **In Progress column:** "Complete" button → toggles to Done

**Card sort:** ICE descending within each column.

**No drag-and-drop** — status changes via buttons only.

### 4b. Dependency DAG (Bottom Section)

Interactive 2D directed graph using existing `3d-force-graph` engine in 2D mode (`ForceGraph` from the same library, or `ForceGraph3D` with `numDimensions(2)`).

**Nodes:**
- One per initiative (only themes with scores)
- Size: proportional to ICE score
- Color: matches readiness status (red = blocked, green = ready, blue = in progress, charcoal = done)
- Label: theme name

**Edges:**
- Directed arrows from blocker → blocked theme
- Default: semi-transparent
- Critical path edges: thicker, full opacity, brighter color

**Interactions:**
- **Click node:** highlights full dependency chain (all upstream blockers and downstream dependents). Dims everything else. Side panel appears showing: initiative name, status, ICE score, blocker list, enables list.
- **Click background:** clears highlight

**Critical path:** visually emphasized with thicker, brighter edges (see Section 5).

---

## 5. Critical Path Algorithm

Client-side computation, no LLM call. Runs instantly. Recomputes on any status change.

### Steps

1. **Build adjacency list** from all themes' `blocks` arrays. Map theme names to theme IDs.
2. **Cycle detection & breaking** — if circular dependencies exist (LLM error), detect via DFS. Break the weakest edge (source has lower ICE score). Log warning to console.
3. **Topological sort** the DAG.
4. **Longest path computation** — walk sorted nodes, track distance to each. The path ending at the highest-distance node is the critical path.
5. **Store result** in `STATE.criticalPath` as array of theme IDs.

### Usage

- DAG renderer checks if an edge's source and target are both in `STATE.criticalPath` (adjacent in the array) → renders with thick, bright style
- Pipeline view header shows: "Critical path: Data Warehouse → AI Platform → Client Portal (3 steps)"

### Recomputation

Triggers:
- Status change (manual toggle)
- New scores generated
- Theme data changes

---

## 6. Files to Create/Modify

| File | Change |
|------|--------|
| `public/js/config.js` | Add `initiativeStatus: {}`, `criticalPath: []` to STATE |
| `public/js/projects.js` | Add `generateValueOnly()`, modify `generateProjectDocs()` to trigger batch scoring |
| `public/js/views.js` | Add Readiness column, enhance Dependencies column, update category headers, add `renderPipeline()`, `renderKanban()`, `renderDAG()`, `toggleInitiativeStatus()`, `computeStatus()`, `computeCriticalPath()` |
| `public/js/graph.js` | May extract shared graph utilities, or keep DAG self-contained in views.js |
| `public/css/app.css` | Kanban board styles, status badges, DAG container, critical path edge styles |
| `public/index.html` | Add sidebar button for Pipeline view, add `view-pipeline` panel |

---

## 7. State Shape

```javascript
STATE = {
  // ... existing fields ...
  initiativeStatus: {},  // { [themeId]: 'in_progress' | 'done' }
  criticalPath: [],      // [themeId, themeId, ...] ordered chain
}
```

sessionStorage keys:
- `initiative_status` — JSON of initiativeStatus
- `project_docs` — already exists, now populated for all themes after first generation
