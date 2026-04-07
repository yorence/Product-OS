# Two-Week Sprint Roadmap: Data Platform & AI Foundation
**Sprint Dates:** Week 1 (Apr 1 - Apr 4) | Week 2 (Apr 7 - Apr 11)
**Team:** DevTech (Ariel, Yorence), Data Team (Eileen, Greg, Adam), Salesforce (Melissa, Anami)

---

## P0 -- Critical Path (Must complete this sprint)

### 1. STAR Read-Only Service Account Setup
- **Owner:** Adam Daube + Eden (Security)
- **Week 1:** Define service account requirements; submit request to SecOps with RBAC/ABAC scope
- **Week 1:** Identify non-sensitive data subset for proof-of-concept (e.g., billing history, client list)
- **Week 2:** Provision read-only SQL service account on STAR; validate access from sandbox environment
- **Depends on:** Security approval from Eden/SecOps
- **Exit criteria:** Service account can execute SELECT queries against approved STAR tables from DevTech sandbox

### 2. MCP Server Proof-of-Concept
- **Owner:** Ariel Sofi, Yorence Ramiz
- **Week 2:** Stand up MCP server connected to STAR read-only service account
- **Week 2:** Demonstrate basic query: "List clients with outstanding balances" via Wes agent
- **Depends on:** P0.1 (service account)
- **Exit criteria:** Working MCP endpoint returning real (or anonymized) STAR data in sandbox

### 3. AI Center of Excellence Reactivation
- **Owner:** Ariel Sofi
- **Week 1:** Identify all active AI initiatives across the firm; create inventory document
- **Week 1:** Schedule first bi-weekly AI CoE meeting with cross-functional stakeholders (Data Team, Salesforce, DevTech, Primo's group, SecOps)
- **Week 2:** Hold kickoff meeting; establish charter, cadence (bi-weekly), and communication channel
- **Exit criteria:** Meeting held, attendee list confirmed, next meeting scheduled

---

## P1 -- High Priority (Start this sprint, may extend)

### 4. Salesforce-to-Conflict Check Integration Assessment
- **Owner:** Melissa Caban, Anami Kumpawat, Yorence Ramiz
- **Week 1:** Melissa sends conflict check sandbox screenshots + matter party structure comparison to DevTech
- **Week 1:** Document current-state data flow: Conflict Check (sandbox) -> Salesforce flow -> Opportunity auto-generation
- **Week 2:** Identify data mapping gaps between matter party fields and Salesforce contact/account model
- **Week 2:** Define requirements for promoting conflict check from sandbox to production
- **Exit criteria:** Current-state and target-state data flow documented; gap analysis complete

### 5. Data Inventory & Volume Assessment
- **Owner:** Adam Daube, Greg Spaulding
- **Week 1:** Compile inventory of all data stores: network drives (F: drive), Azure SQL, Domo, CaseWare, mFiles, Box
- **Week 1:** Pull storage volume metrics per drive/system
- **Week 2:** Estimate data velocity (ingest rate during peak/tax season vs. off-season)
- **Week 2:** Identify top 3 data quality issues per system (naming, duplication, entity attribution)
- **Exit criteria:** Data inventory spreadsheet with system, volume, owner, format, and known quality issues

### 6. Records Retention Compliance Baseline
- **Owner:** Adam Daube (Records Administrator)
- **Week 1:** Share Records Retention Policy v1.5 with DevTech team
- **Week 2:** Identify which systems/drives have records beyond the 8-year retention period
- **Week 2:** Estimate percentage of non-conformant records by service line
- **Exit criteria:** Baseline compliance report with % conformance per drive/system

---

## P2 -- Important (Plan & scope this sprint, execute next sprint)

### 7. Document Classification Pipeline Scoping
- **Owner:** Ariel Sofi, Yorence Ramiz
- **Week 2:** Assess existing OCR/document classification pipeline capabilities (already built per Ariel)
- **Week 2:** Identify a target folder (e.g., BCS mFiles migration subset) for classification pilot
- **Exit criteria:** Pilot scope defined; target folder selected; success criteria for classification accuracy established

### 8. Richard's Visio Workflow Digitization
- **Owner:** Adam Daube, Ariel Sofi
- **Week 1:** Adam sends Richard's existing Visio workflow to Ariel
- **Week 2:** Review and annotate workflow with findings from Salesforce + Conflict Check discovery sessions
- **Exit criteria:** Updated digital workflow reflecting actual current-state process (not assumed)

### 9. Azure Data Factory / Domo Architecture Review
- **Owner:** Greg Spaulding, Ariel Sofi
- **Week 2:** Greg walks Ariel through current ADF pipelines, staging tables, and Domo push architecture
- **Week 2:** Identify opportunities to consolidate into centralized data warehouse (Azure SQL or lakehouse)
- **Exit criteria:** Architecture diagram of current ADF flows; list of consolidation opportunities

### 10. Security Sandbox Protocol Documentation
- **Owner:** Yorence Ramiz, Eden (Security)
- **Week 1:** Document the DevTech sandbox approach: isolated environment, no production data editing, security report delivery model
- **Week 2:** Get preliminary acknowledgment from SecOps on sandbox protocol
- **Exit criteria:** Written sandbox security protocol shared with SecOps for review

---

## Sprint Ceremonies
| Event | When | Attendees |
|-------|------|-----------|
| Sprint Kickoff | Day 1, Week 1 | All owners |
| Mid-Sprint Check-in | Day 3, Week 1 | Ariel, Yorence, Adam |
| AI CoE Kickoff | Week 2 | Cross-functional |
| Sprint Review/Demo | Day 5, Week 2 | All owners + Richard Salinas |

## Key Action Items from Discovery
- [ ] Melissa: Send conflict check sandbox screenshots + matter party structure to Ariel/Yorence
- [ ] Adam: Email Richard's Visio workflow to Ariel
- [ ] Adam: Email Records Retention Policy to Ariel
- [ ] Yorence: Send Miro board link to Melissa, Adam, Anami
- [ ] Ariel/Yorence: Formalize read-only service account requirements; loop in Eden
