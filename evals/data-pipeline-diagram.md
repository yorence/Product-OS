# Data Pipeline & Flow Diagram
**Date:** March 31, 2026
**Source:** Discovery sessions (March 24 & March 30, 2026)

---

## Current State — Data Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KAUFMAN ROSSIN DATA FLOW                             │
│                         Current State (As-Is)                               │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌──────────────────┐
                        │   SALESFORCE      │
                        │   (Cloud CRM)     │
                        │                   │
                        │ • Opportunities   │
                        │ • Client Accounts │
                        │ • Conflict Checks │
                        │   (SANDBOX ONLY)  │
                        └────────┬──────────┘
                                 │
                                 │  DbAmp (CData)
                                 │  SQL Server Pipelines
                                 │  Stored Procedures
                                 ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  CONFLICT CHECK  │    │   SQL SERVER     │    │  AZURE DATA      │
│    SYSTEM        │───▶│   (On-Prem)      │◀──▶│  FACTORY         │
│                  │    │                   │    │                  │
│ • Matter Parties │    │ • Staging Tables  │    │ • Data Movement  │
│ • Clearance      │    │ • Data Products   │    │ • ETL Pipelines  │
│   Status         │    │ • CDC Tracking    │    │ • API Calls      │
│ • Color-coded    │    │ • Audit Logs      │    │  (Internal APIs) │
│   Results        │    │                   │    │                  │
└──────────────────┘    └────────┬──────────┘    └────────┬─────────┘
                                 │                         │
                    ┌────────────┼────────────┐            │
                    │            │            │            │
                    ▼            ▼            ▼            ▼
          ┌─────────────┐ ┌───────────┐ ┌─────────┐ ┌──────────────┐
          │    STAR      │ │   DOMO    │ │ AZURE   │ │  AZURE SQL   │
          │ (Hub System) │ │ (BI/      │ │ DATA    │ │  (DevTech    │
          │              │ │ Reporting)│ │ LAKE    │ │   Access)    │
          │ • Practice   │ │           │ │         │ │              │
          │   Mgmt       │ │ • Reports │ │ • Blob  │ │ • Emerging   │
          │ • General    │ │ • Dashbds │ │   Store │ │   data store │
          │   Ledger     │ │ • KPIs    │ │ • Raw   │ │   for AI     │
          │ • Client     │ │           │ │   Data  │ │   workloads  │
          │   Master     │ │ Federated │ │         │ │              │
          │ • Billing    │ │ Services  │ │         │ │              │
          │              │ │           │ │         │ │              │
          └──────┬───────┘ └───────────┘ └─────────┘ └──────────────┘
                 │
                 │  Normal sync (bi-directional)
                 │
                 ▼
          ┌──────────────┐
          │  SALESFORCE   │◀──── Loop: STAR data pushes
          │  (Client      │      back into Salesforce
          │   Data Sync)  │      (client fields, etc.)
          └──────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                     DOCUMENT & FILE STORAGE LAYER                           │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │ NETWORK      │   │  CASWARE     │   │  M-FILES     │   │    BOX       │
  │ DRIVES       │   │  (Citrix)    │   │  (DMS)       │   │  (Cloud)     │
  │ (F: drive)   │   │              │   │              │   │              │
  │              │   │ • Trial      │   │ • BCS first  │   │ • Some       │
  │ • Engagement │   │   Balances   │   │   service    │   │   service    │
  │   Documents  │   │ • Financial  │   │   line       │   │   lines      │
  │ • Client     │   │   Statements │   │ • Structured │   │ • Legacy     │
  │   Deliverbles│   │ • Audit      │   │   document   │   │   storage    │
  │ • PDFs,      │   │   Workpapers │   │   mgmt       │   │              │
  │   Excel,     │   │              │   │              │   │              │
  │   Word       │   │ NOT easily   │   │ Migration    │   │              │
  │              │   │ discoverable │   │ in progress  │   │              │
  │ ~30+ TB      │   │              │   │              │   │              │
  │ Manually     │   │ App-level    │   │              │   │              │
  │ organized    │   │ access only  │   │              │   │              │
  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                     TARGET STATE — AI DATA LAYER                            │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌────────────────────┐
                         │    WES AGENT       │
                         │  (Agentic AI       │
                         │   Platform)        │
                         │                    │
                         │ • Chatbot UI       │
                         │ • Workflow Mgmt    │
                         │ • Data Discovery   │
                         └────────┬───────────┘
                                  │
                                  │  User Token (RBAC + ABAC)
                                  ▼
                         ┌────────────────────┐
                         │    MCP SERVER      │
                         │  (Read-Only        │
                         │   Data Bridge)     │
                         │                    │
                         │ • Service Account  │
                         │ • Token Passthru   │
                         │ • Audit Logging    │
                         │ • Query Interface  │
                         └────────┬───────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
          ┌─────────────┐ ┌───────────┐ ┌──────────────┐
          │  STAR/SQL   │ │  VECTOR   │ │  DOCUMENT    │
          │  (Structured│ │  STORE    │ │  PIPELINE    │
          │   Data)     │ │           │ │              │
          │             │ │ • Client  │ │ • OCR/       │
          │ • Client    │ │   Embddngs│ │   Classify   │
          │   Records   │ │ • Graph   │ │ • Extract    │
          │ • Billing   │ │   Reprsntn│ │ • Tag        │
          │ • Engagement│ │ • Temporal│ │ • Parquet    │
          │   Data      │ │   Context │ │   Storage    │
          └─────────────┘ └───────────┘ └──────────────┘
                                  │
                                  ▼
                         ┌────────────────────┐
                         │    LLM LAYER       │
                         │  (Foundation Model) │
                         │                    │
                         │ • Fine-tuned for   │
                         │   KR context       │
                         │ • Entity/relation  │
                         │   awareness        │
                         │ • Temporal context  │
                         └────────────────────┘
```

---

## Data Flow Descriptions

### Flow 1: Salesforce → SQL Server → STAR (Client Onboarding)
```
Salesforce Opportunity (Closed Won)
    │
    ▼
New Client Acceptance Form (in Salesforce)
    │
    ▼
Approval Process (Salesforce)
    │
    ▼
Push to STAR (via DbAmp / SQL Server stored procedures)
    │
    ▼
STAR creates client record
    │
    ▼
Normal sync pushes STAR data back to Salesforce
```

### Flow 2: Conflict Check Path (Service lines that require it)
```
Conflict Check Created (currently manual / standalone)
    │
    ▼
Matter parties entered + reviewed
    │
    ▼
Status: Cleared / Not Cleared
    │
    ├── If Cleared ──▶ Salesforce flow auto-generates Opportunity
    │                        │
    │                        ▼
    │                   Normal onboarding flow (Flow 1)
    │
    └── If Not Cleared ──▶ STOP — No opportunity created
                            No further data flow
```

### Flow 3: Data Team Pipeline (SQL Server ↔ Azure)
```
Source Systems (STAR, Salesforce, etc.)
    │
    ▼
Azure Data Factory (orchestration)
    │
    ├──▶ Internal APIs (transformation)
    │
    ▼
SQL Server Staging Tables
    │
    ├──▶ Domo (BI reporting - federated or direct push)
    ├──▶ Azure SQL (DevTech access)
    └──▶ Azure Data Lake (blob storage for raw data)
```

### Flow 4: Target State — AI Agent Data Access
```
User Query (via Wes chatbot)
    │
    ▼
User Authentication → Token issued (RBAC + ABAC)
    │
    ▼
MCP Server receives query + token
    │
    ├──▶ STAR/SQL (structured queries)
    ├──▶ Vector Store (semantic search over embeddings)
    └──▶ Document Pipeline (PDF/Excel classification + extraction)
    │
    ▼
LLM processes results with user context + temporal awareness
    │
    ▼
Response returned to user (with data lineage metadata)
```

---

## Key Integration Points & Protocols

| Source | Destination | Method | Status |
|--------|------------|--------|--------|
| Salesforce | SQL Server | DbAmp (CData) + Stored Procs | Production |
| SQL Server | STAR | DbAmp + Stored Procs | Production |
| STAR | Salesforce | Normal sync (bi-directional) | Production |
| SQL Server | Domo | Direct push / ADF | Production |
| SQL Server | Azure SQL | Azure Data Factory | Production |
| Conflict Checks | Salesforce | Salesforce Flow (auto-generate opp) | Sandbox Only |
| Network Drives | M-Files | Manual migration (BCS first) | In Progress |
| STAR/SQL | MCP Server | Service Account (read-only) | **Not Yet Built** |
| Documents | AI Pipeline | OCR + Classification | **Built, not connected** |
