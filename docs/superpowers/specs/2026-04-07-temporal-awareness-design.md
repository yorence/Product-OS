# Temporal Awareness — Version History & Meeting Provenance

**Date:** 2026-04-07
**Status:** Approved
**Scope:** Version snapshots, provenance display, history timeline, side-by-side diff, AI changelog

---

## 1. Version Data Model

Every doc generation creates a version snapshot stored alongside the current docs.

### Version Object

```javascript
{
  version: 3,                     // incrementing integer
  generated_at: 1744012800000,    // Date.now() at generation time
  meeting_ids: [1001, 1002, ...], // recording IDs analyzed for this version
  meeting_count: 25,              // total meetings in STATE at generation time
  analyzable_count: 22,           // meetings with transcripts (those actually sent to LLM)
  type: 'full',                   // 'full' | 'value_only'
  docs: { prep, value, brief, roadmap, security, pipeline, process },
  changelog: null                 // AI summary, filled async after generation
}
```

### Storage

- **Key:** `doc_history_${topicId}` in localStorage
- **Value:** JSON array of version objects, newest first, max 5 entries
- **On new generation:** unshift new version, pop if length > 5
- **`STATE.projectDocs[topicId]`** continues to point to the latest version's docs (unchanged behavior for all existing code)

### Pruning

Max 5 versions per theme. Each full snapshot is ~15-20KB. With 10 themes = ~1MB total, well within localStorage's ~5MB limit.

### Value-Only Scoring

When `generateValueOnly()` runs (auto-scoring), it creates a version with `type: 'value_only'` and only `docs.value` populated. When full docs are later generated for the same theme:
- If the latest entry in history is `type: 'value_only'`, the full generation **replaces** it (same slot, updated metadata and docs).
- If the latest entry is `type: 'full'`, the full generation is **pushed** as a new entry normally.
This prevents the history from filling up with partial snapshots while preserving all full generations.

---

## 2. Provenance Display

### Project Page Header Badge

Below the existing metadata line (meeting count, segments, status badge), add:

```
Generated Apr 7, 2026 · v3 · from 22 of 25 meetings · History >
```

- **Date:** formatted from `generated_at`
- **Version:** "v" + version number
- **Coverage:** "from X of Y meetings" — analyzable vs total
- **"History >"** — clickable, switches to the History tab

Styled as a muted line using `--fd` at 12px, `--text-muted` color. "History >" link in `--blue`.

### Per-Artifact Provenance

Each artifact tab (Business Case, Brief, Roadmap, etc.) shows at the top:

```
Based on 15 transcript segments from 8 meetings · v3 · Apr 7, 2026
```

Uses the theme's existing `segments` array length and `videoCount`, plus version metadata. Styled as muted `--fb` 13px text with a bottom border separator.

### Meeting Influence Indicators

In the Overview tab (which already groups segments by meeting via `buildTopicOverviewHtml`), add a relevance bar next to each meeting header showing its relative contribution:

- Aggregate `relevanceScore` across all segments for each meeting
- Normalize to a percentage of the highest-scoring meeting (so the top contributor shows 100%)
- Render as a small horizontal bar: `background: var(--green)`, width proportional to percentage
- Show percentage text next to it

This uses existing data — no new computation or API calls needed.

---

## 3. History Tab

A new tab added to the project page tab bar, after "Process".

### Version Timeline

Vertical timeline, newest at top. Each entry shows:

```
[filled dot] v3 — Apr 7, 2026, 2:15 PM                    [Current]
  From 22 meetings (3 new since v2)
  "Business value score increased from 6->8 after..."
  [View] [Compare with v2]

[filled dot] v2 — Mar 30, 2026, 11:42 AM
  From 19 meetings (initial full generation)
  "Initial generation. Key findings: Salesforce..."
  [View] [Compare with v1]

[empty dot] v1 — Mar 30, 2026, 11:40 AM                   [Value Only]
  From 19 meetings (auto-scored)
  No changelog
  [View]
```

**Visual indicators:**
- Filled dot (solid `--blue` circle) = full generation
- Empty dot (border-only circle) = value-only generation
- `[Current]` badge on the newest version in `--green`

**Changelog display:**
- Shown inline under each version entry
- If changelog is null and type is 'full': show "Generating..." with spinner (background call still running)
- If changelog is null and type is 'value_only': show "Value-only generation — no changelog"
- Styled as italic `--fb` 14px, `--text-light` color

**"New meetings" count:**
- Computed by diffing `meeting_ids` arrays between consecutive versions
- Shows: "3 new since v2" or "19 new — initial generation" if it's the first version
- New meeting titles shown in a tooltip or expandable list on click

### View Old Version

Clicking "View" loads that version's `docs` into the artifact tabs. The project page shows a **yellow banner** at the top:

```
Viewing v2 (Mar 30, 2026) — not current  [Back to latest]
```

Banner: `background: #fff8ec; border-left: 3px solid #f39c12;` (matches existing warning callout style). "Back to latest" restores `STATE.projectDocs[topicId]` from the latest version.

While viewing an old version, all artifact tabs render read-only from the snapshot. The "Generate All Project Docs" button is hidden to prevent confusion.

### Compare Button

"Compare with vN" opens the diff view (Section 4) below the timeline, comparing the selected version against the one directly before it (or against any version via a dropdown if more than 2 exist).

---

## 4. Side-by-Side Diff

### Structured Data Diff (Business Case, Meeting Prep)

For JSON-structured artifacts (`value`, `prep`), show field-by-field comparison:

```
Score:       6  →  8    [green highlight]
Effort:      5  →  5    (unchanged, muted)
Confidence:  4  →  7    [green highlight]
ICE:        5.0 → 6.7   [green highlight]
```

For arrays (research findings, action items, emails):
- Items present in new but not old: green "Added" badge
- Items present in old but not new: red "Removed" badge
- Items present in both: show side-by-side if text differs

### Markdown Diff (Brief, Roadmap, Security, Pipeline, Process)

Two-column layout. Line-by-line text diff using a longest-common-subsequence (LCS) algorithm:

- **Green background** (`--green-10`): added lines
- **Red background** (`#fde8e8`): removed lines with strikethrough text
- **No highlight**: unchanged lines

The LCS diff is computed entirely client-side (~50 lines of JS). Each artifact gets a collapsible diff section so you can focus on what matters.

### Diff Header

```
Comparing v2 → v3 · 12 lines changed across 4 artifacts
```

Shows total change count and which artifacts had changes.

---

## 5. AI Changelog Generation

### Trigger

After each **full** doc generation (not value-only), once the docs are rendered and the user is looking at them, fire a background Perplexity call to summarize what changed.

### Prompt

```
Compare these two versions of project documentation for the initiative "[theme name]".

PREVIOUS VERSION (v2, generated Mar 30):
- Score: 6, Effort: 5, Confidence: 4
- Meetings analyzed: 19
- Key sections: [first 200 chars of brief, roadmap]

CURRENT VERSION (v3, generated Apr 7):
- Score: 8, Effort: 5, Confidence: 7
- Meetings analyzed: 22 (3 new: "[title1]", "[title2]", "[title3]")
- Key sections: [first 200 chars of brief, roadmap]

Write a 2-4 sentence plain-English summary of what changed and why.
Focus on: score changes, new insights from new meetings, shifted priorities, new/removed action items.
```

~2K chars input, ~200 tokens output. Runs through existing `perplexityCall()` with retry.

### Storage

The changelog string is written into the version object's `changelog` field in localStorage. If the call fails, `changelog` stays null — UI shows "Changelog unavailable."

### Skip Conditions

- First-ever generation (v1): changelog = "Initial generation from X meetings."
- Value-only generation: no changelog call (type = 'value_only')
- No prior full version to compare against: changelog = "First full generation."

---

## 6. Files to Create/Modify

| File | Change |
|------|--------|
| `public/js/history.js` (new) | `saveVersion()`, `getHistory()`, `pruneHistory()`, `computeTextDiff()`, `computeStructuredDiff()`, `generateChangelog()`, `renderHistoryTab()`, `renderDiffView()`, `viewOldVersion()`, `restoreLatest()`, `renderProvenanceBadge()`, `renderMeetingInfluence()` |
| `public/js/projects.js` | Call `saveVersion()` after doc generation. Add provenance badge to header. Add History tab to tab bar. Hide generate button when viewing old version. |
| `public/js/config.js` | No STATE changes needed — history lives in localStorage only, not STATE |
| `public/index.html` | Add `<script src="js/history.js"></script>` |
| `public/css/app.css` | Timeline styles, diff styles (green/red highlights), provenance badge, old-version banner, influence bars |

---

## 7. Data Flow

```
User clicks "Generate All Project Docs"
  │
  ├─ generateProjectDocs() runs → gets docs from Perplexity
  │
  ├─ saveVersion(topicId, docs, 'full')
  │    ├─ Reads existing history from localStorage
  │    ├─ Builds version object with metadata
  │    ├─ If latest is value_only, replaces it; else unshifts
  │    ├─ Prunes to max 5
  │    └─ Writes back to localStorage
  │
  ├─ STATE.projectDocs[topicId] = docs  (existing behavior)
  ├─ renderProjectPage(topicId)         (existing behavior)
  │
  └─ generateChangelog(topicId)  [background, non-blocking]
       ├─ Reads prev version from history
       ├─ Builds diff prompt → perplexityCall()
       ├─ Writes changelog into version object in localStorage
       └─ If History tab is open, re-renders it
```
