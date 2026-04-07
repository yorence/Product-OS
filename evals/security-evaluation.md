# Security Evaluation: AI & Data Systems Integration
**Date:** March 31, 2026
**Prepared by:** DevTech Product Team
**Classification:** Internal — Confidential
**Reference documents:** KR Written Information Security Program (WISP 2025), KR Records Retention Policy & Schedule (v1.5)

---

## Executive Summary

Kaufman Rossin is pursuing the integration of multiple internal systems (Salesforce, STAR, SQL Server, Azure, Domo, CaseWare, network drives) to enable AI-driven data discovery and workflow automation via the "Wes" agentic platform. This evaluation assesses the security considerations of connecting these systems, identifies risks, and recommends mitigations aligned with the firm's WISP and records retention policies.

**Overall Risk Rating: MEDIUM-HIGH**

The firm's data posture presents manageable technical risks but significant governance gaps. The two-person SecOps team is a structural bottleneck. The absence of a formal data catalog, inconsistent access controls across systems, and aspirational (not enforced) retention policies create a surface area that must be addressed before production AI deployments.

---

## 1. Authentication & Access Control

### Current State
- **STAR/SQL Server:** Access controlled at the database level. No service accounts currently exist for programmatic AI access.
- **Salesforce:** API connectivity exists. Recent API connection set up by Jason. DbAmp uses SQL Server credentials to bridge.
- **Network Drives (F: drive):** Permissions are folder-level, manually managed. No centralized identity governance.
- **CaseWare:** Locally installed on Citrix. Access is application-level, not integrated with firm-wide identity.
- **Domo:** Federated service support; connects directly to data sources.

### Risks
| Risk | Severity | Likelihood |
|------|----------|------------|
| No service account standards for AI/MCP access to STAR | High | Confirmed |
| Lack of unified identity provider across all systems | Medium | Confirmed |
| Network drive permissions are manually managed and unaudited | High | Confirmed |
| CaseWare access is siloed from central auth | Medium | Confirmed |

### Recommendations
1. **Establish a dedicated service account** for the MCP/Wes platform with read-only access to STAR/SQL, rotating tokens, and full audit logging. Adam Daube and Eden (SecOps) must co-design this. *Aligns with WISP access control requirements.*
2. **Implement RBAC + ABAC** as the DevTech team has proposed (role-based + attribute-based access control). Ensure the token pass-through model is validated by SecOps before any production data flows.
3. **Audit network drive permissions** across all service lines before connecting AI agents to document stores. Current state is manually managed with no visibility into who has access to what.

---

## 2. Data Classification & Governance

### Current State
- No formal data catalog exists.
- No automated data classification or tagging.
- Client industry classification exists in 5+ conflicting versions across systems.
- Network drive documents are manually organized, inconsistently named, and sometimes contain conflated client data (e.g., children's tax returns filed under parent client).
- The data team has begun data classification efforts but they are early-stage.

### Risks
| Risk | Severity | Likelihood |
|------|----------|------------|
| AI agents surface or correlate data across clients improperly | Critical | Medium |
| Confidential client data is exposed to unauthorized users via AI | Critical | Medium |
| No data lineage tracking — cannot trace where AI-sourced answers originate | High | Confirmed |
| Conflated client records lead to incorrect AI outputs | High | High |

### Recommendations
1. **Establish data classification tiers** (public, internal, confidential, restricted) before connecting AI to any data source. This is a prerequisite, not a follow-up.
2. **Implement data lineage tracking** in the MCP/Wes architecture. Every AI response must be traceable to its source records and the user's access permissions at query time.
3. **Resolve client data conflation** in network drives as a data quality initiative. AI systems will amplify existing data quality issues, not fix them.

---

## 3. Data in Transit & At Rest

### Current State
- **Azure Data Factory** handles data movement (replaced SSIS). Supports encrypted connections.
- **DbAmp** bridges Salesforce to SQL Server. Uses SQL Server infrastructure.
- **Internal APIs** are used for data transformation within Azure Data Factory pipelines.
- **Network drives** store data at rest with OS-level encryption (assumed; not confirmed).
- **Domo** stores data in its cloud platform.

### Risks
| Risk | Severity | Likelihood |
|------|----------|------------|
| Data in transit between MCP server and STAR/SQL may not be encrypted | High | Medium |
| Domo stores firm data in third-party cloud without clear DLP controls | Medium | Medium |
| Data extracted for AI processing may persist in temporary storage (S3/Azure blob) without retention controls | High | Medium |
| LLM API calls may transmit client data to external AI providers | Critical | Medium |

### Recommendations
1. **Enforce TLS 1.2+ for all data in transit**, especially between the MCP server and STAR/SQL, and between Azure components.
2. **Define a data residency policy** for AI workloads. If using external LLM APIs (e.g., Azure OpenAI, Anthropic), ensure client data is not retained by the provider. Prefer Azure OpenAI with data processing agreements that guarantee no training on customer data.
3. **Apply retention policies to AI staging data.** Parquet files, embeddings, and vector store data must have defined TTLs and automated cleanup aligned with the Records Retention Schedule.
4. **Confirm encryption at rest** for all network drives, Azure SQL, and any new storage introduced for AI workloads.

---

## 4. Regulatory & Compliance Considerations

### Current State
- **Records Retention Policy (v1.5):** Firm-wide, 8-year default for most client records. Policy is reviewed annually. Adam Daube is Records Administrator.
- **Compliance is aspirational.** Per the data team: "It's a policy, but it's aspirational. A lot of people aren't conformant to it, and there's no easy way to measure this across the firm."
- **WISP 2025** governs information security practices firm-wide.
- **Legal holds** can suspend retention schedules. No automated mechanism exists to enforce holds across all systems.

### Risks
| Risk | Severity | Likelihood |
|------|----------|------------|
| AI-generated embeddings/indexes of client data may create new "records" subject to retention requirements | High | High |
| No mechanism to enforce legal holds on AI-derived data stores | High | Medium |
| Client data used for LLM fine-tuning may violate engagement letter terms | Critical | Unknown |
| Retention non-compliance across network drives may be surfaced or amplified by AI tools | Medium | High |

### Recommendations
1. **Classify AI artifacts as records.** Embeddings, vector stores, cached responses, and parquet files derived from client data must be treated as records under the Records Retention Policy and destroyed per the applicable retention schedule.
2. **Legal review is required** before using any client engagement data for LLM fine-tuning, RAG retrieval, or knowledge graph construction. Engagement letters may restrict data usage.
3. **Build legal hold enforcement into AI infrastructure.** If a legal hold is issued, all AI-derived data (embeddings, caches, indexes) for the affected client must be preserved and excluded from automated purging.
4. **Leverage AI to improve compliance.** Use the document classification pipeline to identify records beyond their retention period and flag them for review — turning a compliance gap into an automation win.

---

## 5. Third-Party & Vendor Risk

### Current State
| Vendor/System | Data Access | Risk Level |
|---------------|-------------|------------|
| Salesforce | Client CRM data, conflict checks | Medium |
| Domo | BI/reporting data from STAR + other sources | Medium |
| Azure (Microsoft) | Data Factory, Azure SQL, potential AI services | Medium |
| DbAmp (CData) | SQL Server ↔ Salesforce bridge | Low-Medium |
| M-Files | Document management (early rollout) | Low |
| CaseWare | Financial statements, trial balances | Low (isolated) |
| LLM Provider (TBD) | Receives query context + potentially client data | High |

### Risks
| Risk | Severity | Likelihood |
|------|----------|------------|
| LLM provider retains or trains on client data | Critical | Depends on provider |
| Domo data exfiltration or unauthorized access | Medium | Low |
| DbAmp credential compromise bridges Salesforce and SQL Server | Medium | Low |

### Recommendations
1. **Select LLM providers with contractual guarantees** against data retention and training on customer data. Azure OpenAI and AWS Bedrock offer these. Avoid consumer-tier AI APIs.
2. **Review DbAmp credentials and rotation schedule.** This tool bridges two critical systems and should be under service account governance.
3. **Include AI data processing requirements in vendor assessments.** Update the firm's vendor risk assessment process to include questions about AI data handling.

---

## 6. Operational Security

### Current State
- **SecOps team:** 2 people. Yorence stated DevTech wants to avoid being "a laggard" and reduce SecOps burden.
- **Sandbox approach:** DevTech plans to build in sandbox environments, conduct security checks, then present security reports for approval before production deployment.
- **Logging:** Data team tracks transfers and changes for auditing in SQL Server. No centralized SIEM observed.

### Risks
| Risk | Severity | Likelihood |
|------|----------|------------|
| 2-person SecOps team cannot review all AI integrations in a timely manner | High | Confirmed |
| Sandbox environments may drift from production security posture | Medium | Medium |
| No centralized logging/monitoring across the integrated system landscape | High | Confirmed |

### Recommendations
1. **Adopt the sandbox-first model** that DevTech proposed, but formalize it: define what "security checks" means, create a checklist for sandbox-to-production promotion, and have SecOps approve the checklist (not each individual deployment).
2. **Centralize audit logging.** All MCP queries, data access events, and AI agent actions must be logged to a central, tamper-resistant store. This is non-negotiable for client data access.
3. **Automate security scanning** of AI deployments (dependency scanning, secret detection, API endpoint testing) to reduce the burden on the 2-person SecOps team.

---

## Summary Risk Matrix

| Category | Risk Level | Top Concern |
|----------|-----------|-------------|
| Authentication & Access | **HIGH** | No service accounts; no unified identity |
| Data Classification | **HIGH** | No catalog; conflated client records |
| Data in Transit/At Rest | **MEDIUM** | LLM data transmission; encryption gaps |
| Regulatory & Compliance | **HIGH** | Aspirational retention; legal review needed for AI use of client data |
| Third-Party/Vendor | **MEDIUM-HIGH** | LLM provider data handling |
| Operational Security | **MEDIUM-HIGH** | 2-person SecOps bottleneck; no centralized logging |

---

## Recommended Priority Actions (Next 30 Days)

1. **[WEEK 1]** Establish service account for MCP with read-only STAR access, co-designed with Eden/SecOps
2. **[WEEK 1]** Begin legal review of client data usage for AI/LLM purposes
3. **[WEEK 2]** Define and document the sandbox-to-production security checklist
4. **[WEEK 2]** Implement centralized audit logging for all AI/MCP data access
5. **[WEEK 3]** Draft data classification framework aligned with WISP
6. **[WEEK 4]** Complete vendor risk assessment for selected LLM provider
