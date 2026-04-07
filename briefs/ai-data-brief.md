# AI Intake Brief

## Problem
Kaufman Rossin's client data lifecycle — from opportunity creation through conflict checks, client onboarding, engagement delivery, and records retention — is fragmented across disconnected systems (Salesforce, STAR, SQL Server, CaseWare, network drives, Domo, M-Files, Box). Data moves between these systems almost exclusively through manual entry and human context-switching. There is no unified data warehouse, no firm-wide data catalog, and no authoritative data discovery layer. This leads to duplicated effort, inconsistent client records, bottlenecked onboarding processes, and an inability to leverage institutional knowledge for AI-driven insights.

**Who experiences it:**
- Tax professionals who cannot quickly surface prior-year client history or relevant IRS publications
- Service line leads who lack visibility into client industry classification (five conflicting versions exist)
- The Salesforce/CRM team who manually bridges conflict check results into opportunities
- The data team (Eileen Martin, Gregory Spaulding, Adam Daube) who field ad-hoc integration requests without a cohesive data strategy
- DevTech / AI team (Ariel Sofi, Yorence Ramiz) who cannot connect agentic AI ("Wes") to firm data without a secure, governed bridge

**Impact of leaving it unsolved:**
- Continued manual data entry errors and onboarding delays
- AI initiatives remain disconnected and duplicative (multiple teams building similar things independently)
- Inability to meet records retention compliance programmatically
- Lost revenue from missed cross-service-line insights and client intelligence

## Target User
**Primary:** Tax professionals, assurance staff, and advisory consultants who need contextual client data to perform engagement work faster and with better accuracy.

**Secondary:** DevTech / AI engineering team who need a governed, read-only data bridge (MCP server) to power the "Wes" agentic platform with real firm data.

**Tertiary:** Operations and compliance stakeholders (Richard Salinas, Ivan Garces, Vlad Rudnitsky) who need programmatic enforcement of records retention and security policies.

**Environment:** Hybrid on-prem (SQL Server, STAR, network F: drives, CaseWare on Citrix) and cloud (Azure Data Factory, Azure SQL, Domo, Salesforce). ~100 TB of data across network drives. Two-person SecOps team. AI Center of Excellence exists but has met only once in six months.

## Why Now
1. **Fragmented AI efforts are accelerating without coordination.** Multiple teams are building AI solutions independently — the AI Center of Excellence has stalled, and DevTech is building "Wes" without data team involvement until now. Without a unified data strategy, these efforts will create more silos, not fewer.
2. **The conflict check / Salesforce integration is actively broken.** Conflict checks exist only in the Salesforce sandbox. The manual handoff between conflict checks, Salesforce opportunities, and STAR onboarding is the single biggest bottleneck in client acceptance.
3. **STAR is stable but not forever.** While the cloud version pricing is prohibitive and no sunset date has been announced, the firm needs to reduce coupling to STAR by building a data abstraction layer now, while there is no urgency.
4. **Compliance risk is growing.** The records retention policy is "aspirational" per the data team — there is no easy way to measure conformance across the firm. Automating retention enforcement is a regulatory necessity.
5. **The data team is ready and willing.** The March 30 meeting demonstrated strong alignment between DevTech and the data team. The soft silos are easy to break down with the right coordination cadence.

## Data Sources
- **STAR** (Practice Management + General Ledger) — central hub for client data; SQL Server backend
- **Salesforce** — CRM, opportunity pipeline, conflict checks (sandbox only)
- **SQL Server** (on-prem) — staging tables, data pipelines via DbAmp and stored procedures
- **Azure Data Factory** — primary data movement tool (migrated from SSIS)
- **Azure SQL** — emerging storage for DevTech data access
- **Domo** — BI/reporting layer; closest thing to a current data warehouse
- **CaseWare** (Citrix) — trial balances and financial statements; not easily discoverable
- **Network Drives (F: drive)** — engagement documents, client deliverables (~30+ TB)
- **M-Files** — document management system (BCS is first service line migrating)
- **Box** — additional document storage (some service lines)

For data source questions, contact Yorence Ramiz at yrvelasquez@kaufmanrossin.com

## User Stories
- As a **tax professional**, I want to ask a chatbot about my client's billing history and prior-year engagement details so that I can prepare returns faster without manually searching STAR and network drives.
- As a **service line lead**, I want a single, authoritative view of client industry classification so that I can identify cross-selling opportunities and avoid conflicting categorizations.
- As a **Salesforce administrator**, I want conflict check clearance to automatically flow into Salesforce opportunities (and vice versa) so that I eliminate manual data re-entry and reduce onboarding time.
- As a **DevTech engineer**, I want a read-only MCP server connected to STAR/SQL with pass-through RBAC+ABAC permissions so that the Wes agent can securely retrieve client data on behalf of authenticated users.
- As the **Chief Risk Officer**, I want programmatic enforcement of the records retention schedule so that I can measure and audit compliance firm-wide without relying on individual employees.
- As a **data team member**, I want a formal data catalog with automated classification and tagging so that I can answer "where does this data live?" questions definitively instead of pointing to five different versions.

## Success Metrics
- Metric 1: Reduce manual data entry steps in the conflict check-to-Salesforce-to-STAR pipeline by 80% within 6 months
- Metric 2: Stand up a read-only MCP proof-of-concept returning accurate STAR data within 4 weeks
- Metric 3: Achieve >90% automated classification accuracy on network drive documents (PDF/Excel) in pilot service line
- Metric 4: Re-establish AI Center of Excellence with bi-weekly cadence and cross-team representation within 2 weeks
- Metric 5: Deliver a measurable records retention compliance dashboard covering at least one service line within 3 months

## Risks / Unknowns
- Risk 1: **Security bottleneck** — Only two SecOps staff; service account and token pass-through architecture requires their sign-off, which could delay MCP proof-of-concept
- Risk 2: **Data veracity** — Network drive data is poorly organized, inconsistently named, and sometimes conflated across clients (e.g., children's returns filed under parent client). Automated classification will need significant validation.
- Risk 3: **Legal / compliance uncertainty** — It is unclear whether client engagement data can be used to train or fine-tune LLMs. Legal counsel has not weighed in.
- Risk 4: **CaseWare accessibility** — Trial balances and financial statements are locked inside CaseWare on Citrix; extraction path is not yet defined.
- Risk 5: **Organizational fragmentation** — AI efforts are siloed across multiple teams. Without sustained executive sponsorship of the AI Center of Excellence, coordination will stall again.
- Unknown 1: Data velocity during tax season is not measured; pipeline capacity requirements are undefined.
- Unknown 2: The full scope of service lines requiring conflict checks vs. those that skip them is not fully documented.
- Unknown 3: M-Files migration timeline and scope beyond BCS is unclear.
