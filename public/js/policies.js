// Firm policies data and viewer
// ═══════ FIRM POLICIES ═══════
const FIRM_POLICIES = {
  retention: `# KR Records Retention Policy & Schedule
**Version:** 1.5 | **Effective:** August 12, 2024 | **Scope:** Firm-wide
**Policy Owner:** Richard Salinas (COO), Ivan Garces (CRO) | **Records Administrator:** Adam Daube

## Key Rules
- Default retention for unclassified records: **max 2 years**
- Most client and administrative records: **8 years**
- Destruction occurs 6-8 months after fiscal year end
- Electronic records on designated centralized server (F: drive)
- Paperless environment — all paper scanned, originals shredded (exceptions: signed engagement letters, signed representation letters, legal confirmations)

## Client Records
- **Audit/Assurance:** 8 years after lock-down (45 days after issuance)
- **Tax returns + workpapers:** 8 years; permanent basis items (current clients): permanent
- **Forensic/Advisory/Valuation:** 8 years after issuance; banking validation: 5 years
- **Expert reports:** 8 years after final adjudication
- **Estate & Trust:** Fiduciary returns 8 years; estate planning docs, 706s, 709s: permanent
- **Escrow Services:** All permanent
- **Accounting & Family Office:** 8 years; return client docs on closing

## Administrative Records
- Corporate documents, bylaws, licenses, policies: **permanent**
- Accounting records, payroll, personnel: **8 years**
- Insurance: **8 years after term**
- IT backup tapes: **8 years**; file server snapshots: **3 months**

## Legal Holds
Litigation/subpoena/investigation triggers suspension. Records Administrator implements holds. Records revert to normal retention once all holds lifted.

## Compliance Gap
Per Adam Daube (March 30, 2026): "The retention policy is aspirational. A lot of people aren't conformant to it, and there's no easy way to measure compliance across the firm."`,

  wisp: `# KR Written Information Security Program (WISP 2025)
**Effective:** 2025 | **Scope:** Firm-wide | **CISO:** Vlad Rudnitsky | **CTO:** Jerry Rodriguez

## Access Control
- All system access must be authenticated and authorized
- Service accounts require security review and approval from SecOps (Eden)
- Principle of least privilege; token-based auth with rotation
- SecOps team is 2 people — approval bottleneck risk

## Data Protection
- Client data is confidential — protected in transit (TLS 1.2+) and at rest (encryption)
- Electronic records on designated centralized servers only
- Files must NOT reside on local hard drives or portable media
- Portable storage returned to client or erased after transfer

## Third-Party & Vendor Management
- Vendors handling client data must be security-assessed
- Data processing agreements required for external AI/LLM providers
- Prefer providers with contractual guarantees against training on customer data
- Vendor risk assessments must include AI data handling questions

## AI/Data Project Implications
- Service accounts with rotating tokens required for MCP/API access
- RBAC + ABAC model proposed for Wes AI platform (per Ariel Sofi)
- User tokens passed through to target systems; LLM has no independent agency
- Sandbox-first development: isolated environment, security reports to SecOps before production
- AI artifacts (embeddings, vector stores, caches) treated as records under retention policy
- Legal review required before using client data for LLM fine-tuning or RAG

## Incident Response
- Security incidents reported immediately
- Legal holds may be triggered by incidents
- All employees must comply; violations = disciplinary action up to termination`
,

  joy: `# JOY — Kaufman Rossin Design System
**Version:** 2.0 | **Scope:** All KR digital and print touchpoints
**Belief:** joy is your bottom line

## Core Palette
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| --green | Apple Green | #aed136 (PMS 2291 C) | Primary accent, CTAs, progress, icons |
| --green-text | Green Text | #5a7200 | AAA-compliant green text on white (7.2:1) |
| --blue | Midnight Blue | #1d4c7e (PMS 7693) | Primary brand, nav, headings, links |
| --charcoal | Charcoal Gray | #3c3c3c (PMS Cool Gray 11) | Body text, utility bar, dark surfaces |
| --bg | Background | #f9f9f9 | Page background, alternate sections |

### Green Tones
100% #aed136 · 80% #beda5e · 60% #cee386 · 40% #deecaf · 20% #eef5d7 · 10% #f6faea

### Blue Tones
100% #1d4c7e · 80% #4a70a0 · 60% #7794bc · 40% #a3b8d4 · 20% #d1dcea · 10% #e8eef4

## Colour Accessibility — WCAG 2.1
- Midnight Blue on White: **AAA** (9.7:1)
- Apple Green on Blue: **AA** (4.8:1)
- Green Text (#5a7200) on White: **AAA** (7.2:1)
- Apple Green on White: **Fail** (2.5:1) — icons/decoration only, NEVER body text
- White on Charcoal: **AAA** (10.4:1)
- Midnight Blue on Apple Green: **AA** (3.9:1)

### Logo Colour Rules
- On White: Blue "Kaufman" + Charcoal "Rossin" + Green bar ✓
- On Blue: White logo + Green bar ✓
- On Green: Blue logo + Blue bar only ✓
- **White on Green: NEVER permitted**

## Typography
### Display — Montserrat (--fd)
- Fallback: Century Gothic → sans-serif
- Weights: 300 · 400 · 600 · 700 · **800** · **900**
- Use: All headlines, buttons, labels, nav, badges
- Style: Uppercase with letter-spacing (.12em–.2em) or tight negative tracking for hero text

### Body — Source Sans 3 (--fb)
- Fallback: Proxima Nova → sans-serif
- Weights: 300 Light · 400 Regular · 600 Semibold
- Use: Body, taglines, captions, quotes
- Tagline ("joy is your bottom line"): always 300 weight, always lowercase, always italic

### Type Scale (Major Third 1.25×)
| Style | Size | Weight | Notes |
|-------|------|--------|-------|
| Display Hero | 72px | 800 | Uppercase, .1em tracking |
| Heading 1 | 48px | 700 | Uppercase |
| Heading 2 | 36px | 600 | |
| Heading 3 | 24px | 600 | |
| Body Large | 18px | 400 | 1.65 leading |
| Body | 16px | 400 | 1.55 leading |
| Label/Badge | 12px | 700 | .18em tracking, uppercase |

## Logo Rules
- Vertical bar between KAUFMAN and ROSSIN means "and" — it is NOT a divider
- Lock-up A (horizontal): minimum 144px / 1.5in
- Lock-up B (stacked): minimum 96px / 1in
- Sub-brand descriptor ("cpa + advisors", "wealth", etc.) always Source Sans 3, 300 weight

### Don'ts
- Never distort, rotate, or skew the logo
- Never use white logo on green background
- Never go below minimum size
- Never change the typeface

## Spacing System
4px base unit. All spacing uses multiples of 4:
| Token | Value | Usage |
|-------|-------|-------|
| --s1 | 4px | Icon gaps, micro-spacing |
| --s2 | 8px | Tag padding, tight gaps |
| --s3 | 12px | List item gap, input padding |
| --s4 | 16px | Card padding, body text margin |
| --s6 | 24px | Component padding, grid gutter |
| --s8 | 32px | Section margins, card gap |
| --s10 | 40px | Form sections, hero sub-margin |
| --s12 | 48px | Content section padding |
| --s16 | 64px | Section breaks, nav height |
| --s20 | 80px | Page sections, hero padding |
| --s24 | 96px | Full-bleed section padding |

## Components
### Buttons
- Montserrat 700, 12px, .12em tracking, UPPERCASE, **NO border-radius** (angular)
- Primary: green bg, blue text
- Outline: transparent bg, blue 2px border
- Ghost: transparent bg, blue text
- On dark: white or green variants

### Badges & Tags
- Montserrat 700, 12px, .12em tracking, UPPERCASE
- Blue: --blue-10 bg, --blue text
- Green: --green-10 bg, --green-text text, --green-40 border
- Dark: --blue bg, white text

### Cards
- White background, box-shadow --sh-sm
- 4px accent bar (top, green or blue)
- Hover: translateY(-2px), --sh-md
- **No border-radius**

### Forms
- 2px solid --gray-20 border, no border-radius
- Focus: blue border + 3px --blue-10 ring
- Error: #a0200d border + #fdf3f2 bg
- Success: #2f7436 border + #f3fbf4 bg

### Alerts
- Left border accent (3px)
- Info: --blue-10 bg, --blue border
- Success: --green-10 bg, --green border
- Warning: #fff8ec bg, #e67e22 border

## Motion
| Token | Value | Usage |
|-------|-------|-------|
| --fast | 150ms | Tooltips, badges, micro-interactions |
| --base | 260ms | Hover states, cards, buttons |
| --slow | 400ms | Page reveals, modals |
| --ease | cubic-bezier(0,0,0.2,1) | Precision interactions |
| --spring | cubic-bezier(0.34,1.56,0.64,1) | Joyful moments, success states |

### Motion Principles
- Animation should feel earned — direct attention, confirm action, add delight — NOT decorate
- Stagger reveals: 80ms delay increments for lists and grids
- Reduced motion: respect prefers-reduced-motion

## Voice & Tone
### This IS JOY
- Conversational. Poses real questions. Pulls the reader in.
- Warm but confident. Specific imagery. Avoids "award-winning firm" clichés.
- Acknowledges reality. Uses ellipsis as a beat. Relatable then direct.

### This is NOT JOY
- Generic jargon ("comprehensive, integrated financial services")
- "Proud to offer" and "best-in-class" = instant reader tune-out
- Cold, bureaucratic language that doesn't sound like family

### Golden Rule
"joy is your bottom line" is always lowercase. Always. It's a belief, not a headline. It lives in white space, footers, and quiet moments — never shouted, always felt.

## Sub-Brands
| Brand | Entity | URL |
|-------|--------|-----|
| K|R cpa + advisors | Primary entity, all core services | kaufmanrossin.com |
| K|R wealth | Wealth management & insurance | kaufmanrossinwealth.com |
| K|R insurance | Risk management & planning | kaufmanrossinwealth.com/services/ |
| K|R fund administration | Admin, compliance, data security | kaufmanrossinais.com |`
};

function showPolicy(key) {
  const content = document.getElementById('policyContent');
  if (!content) return;
  content.innerHTML = simpleMarkdown(FIRM_POLICIES[key] || 'Policy not found.');
  // Update button states
  document.querySelectorAll('[id^="pol-btn-"]').forEach(b => {
    b.style.borderColor = '';
    b.style.color = '';
  });
  const activeBtn = document.getElementById('pol-btn-' + key);
  if (activeBtn) {
    activeBtn.style.borderColor = 'var(--green)';
    activeBtn.style.color = 'var(--green-text)';
  }
}

function getPoliciesContext() {
  return Object.values(FIRM_POLICIES).join('\n\n---\n\n');
}
