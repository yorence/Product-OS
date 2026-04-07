# AI & Data Integration — 2-Week Roadmap
**Sprint dates:** April 1 – April 14, 2026
**Owner:** Ariel Sofi (DevTech) + Yorence Ramiz (DevTech)
**Stakeholders:** Eileen Martin, Gregory Spaulding, Adam Daube, Melissa Caban, Eden (SecOps)

---

## P0 — Must Do (Blockers to all other work)

### P0-1: Re-launch AI Center of Excellence
- **What:** Schedule recurring bi-weekly meeting with all AI stakeholders (DevTech, Data Team, Salesforce Team, SecOps, Richard Salinas)
- **Why:** AI efforts are fragmented. Multiple teams are doing similar work without coordination. This was called out by both the data team and DevTech as the single most important organizational fix.
- **Owner:** Ariel Sofi
- **Due:** April 2 (Day 2)
- **Deliverable:** Calendar invite sent, charter doc with attendees + agenda template

### P0-2: Formalize read-only service account requirements for STAR/SQL
- **What:** Document the technical requirements for a read-only service account that DevTech can use to query STAR data via MCP. Include: authentication method, scope of accessible tables, logging/auditing requirements, token rotation policy.
- **Why:** This is the critical dependency for the Wes agent proof-of-concept. Adam Daube explicitly requested Eden (SecOps) be looped in.
- **Owner:** Yorence Ramiz + Adam Daube
- **Due:** April 4 (Day 4)
- **Deliverable:** Requirements document shared with Eden for security review

### P0-3: Obtain conflict check sandbox access + documentation
- **What:** Get screenshots, schema documentation, and matter-party structure from Melissa Caban (action item from March 24 meeting). Understand the current Salesforce sandbox state of conflict checks.
- **Why:** Cannot design the conflict check automation without understanding the current data model and its inconsistencies.
- **Owner:** Yorence Ramiz
- **Due:** April 3 (Day 3)
- **Deliverable:** Conflict check data model documentation in `discovery/` folder

---

## P1 — Should Do (High-value, dependency on P0 items)

### P1-1: Stand up MCP proof-of-concept with STAR read-only access
- **What:** Deploy a minimal MCP server connected to a read-only STAR/SQL service account. Target: answer simple queries like "list clients with outstanding balances" from a sandboxed environment.
- **Why:** This proves out the foundational architecture for Wes and demonstrates value to stakeholders quickly.
- **Owner:** Ariel Sofi (DevTech)
- **Depends on:** P0-2 (service account)
- **Due:** April 11 (Day 11)
- **Deliverable:** Working MCP endpoint in sandbox returning live STAR data

### P1-2: Map the full client acceptance value stream
- **What:** Complete the Miro board / process map covering: Conflict Check → Salesforce Opportunity → New Client Acceptance → STAR client creation → engagement setup. Document all manual handoff points, branching paths (conflict check required vs. not), and system-to-system data flows.
- **Why:** This is the prerequisite for any automation of the client onboarding pipeline. Both meetings revealed significant ambiguity that must be resolved.
- **Owner:** Yorence Ramiz + Ariel Sofi
- **Depends on:** P0-3 (conflict check documentation)
- **Due:** April 9 (Day 9)
- **Deliverable:** Completed process map with annotated bottlenecks and automation candidates

### P1-3: Inventory existing data pipelines and integrations
- **What:** Catalog all current data pipelines: DbAmp (Salesforce → SQL Server → STAR), Azure Data Factory flows, SSIS legacy jobs, Domo connections, internal APIs. For each: source, destination, frequency, owner, known issues.
- **Why:** Cannot build a data strategy without knowing what already exists. Greg Spaulding is the primary knowledge holder — this reduces bus factor.
- **Owner:** Gregory Spaulding + Adam Daube
- **Due:** April 11 (Day 11)
- **Deliverable:** Pipeline inventory spreadsheet or document in `discovery/` folder

---

## P2 — Nice to Have (Foundational, lower urgency this sprint)

### P2-1: Draft data governance and classification framework
- **What:** Begin defining data classification tiers (public, internal, confidential, restricted), tagging standards, and ownership model. Align with the WISP and records retention policy.
- **Why:** Every conversation surfaced data veracity and classification as a pain point. This framework will guide all future data products.
- **Owner:** Ariel Sofi + Eileen Martin
- **Due:** April 14 (Day 14)
- **Deliverable:** Draft framework document for review

### P2-2: Assess CaseWare data extraction feasibility
- **What:** Investigate whether CaseWare data (trial balances, financial statements) can be programmatically exported or accessed via API. Determine if the Citrix hosting layer adds constraints.
- **Why:** CaseWare is a critical data source that is currently "not discoverable in the general sense" (Eileen Martin). Any AI-driven financial analysis will require access to this data.
- **Owner:** Gregory Spaulding
- **Due:** April 14 (Day 14)
- **Deliverable:** Feasibility assessment (can/cannot extract, method, constraints)

### P2-3: Evaluate records retention compliance measurement
- **What:** Assess the current state of records retention compliance. Identify which drives/systems have data beyond the prescribed retention periods. Scope the effort to build an automated compliance dashboard.
- **Why:** Adam Daube stated the retention policy is "aspirational" with no easy measurement. This is a compliance risk and a quick-win automation candidate.
- **Owner:** Adam Daube
- **Due:** April 14 (Day 14)
- **Deliverable:** Gap analysis document identifying non-compliant data areas

### P2-4: Request Richard Salinas's Visio workflow for client acceptance
- **What:** Obtain and digitize the existing Visio workflow that Richard has been maintaining for the client acceptance process.
- **Why:** This is an existing artifact that can accelerate P1-2. Adam mentioned it during the March 30 meeting.
- **Owner:** Adam Daube
- **Due:** April 4 (Day 4)
- **Deliverable:** Visio file or exported image added to `discovery/` folder

---

## Sprint Exit Criteria
By April 14, the team should have:
1. A functioning AI Center of Excellence with a second meeting already scheduled
2. A working (sandboxed) MCP connection to STAR data
3. A complete, validated process map of the client acceptance pipeline
4. A full inventory of existing data pipelines
5. Clear next steps for the following sprint (conflict check automation design, data catalog pilot, Wes agent expansion)
