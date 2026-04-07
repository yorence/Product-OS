# KR Written Information Security Program (WISP 2025)
**Effective:** 2025 | **Scope:** Firm-wide
**CISO:** Vlad Rudnitsky | **CTO:** Jerry Rodriguez

## Overview
The WISP governs information security practices across Kaufman Rossin. It establishes requirements for protecting client data, managing access controls, securing systems, and responding to incidents.

## Key Security Requirements (Relevant to AI & Data Integration)

### Access Control
- All system access must be authenticated and authorized
- Service accounts require security review and approval
- Access should follow the principle of least privilege
- Token-based authentication with rotation policies required for API access
- SecOps team (2 people) must review and approve new integrations

### Data Protection
- Client data is confidential and must be protected in transit and at rest
- Electronic records must be stored on designated centralized servers
- Portable storage media must be returned to client or erased after transfer
- Files must not reside on local hard drives or portable media
- Encryption required for sensitive data transmission

### Third-Party & Vendor Management
- Third-party services handling client data must be assessed for security
- Data processing agreements required for external AI/LLM providers
- Vendor risk assessments must include questions about data handling and retention
- Prefer providers with contractual guarantees against training on customer data

### Incident Response
- Security incidents must be reported immediately
- The firm maintains incident response procedures
- Legal holds may be triggered by security incidents

### Employee Responsibilities
- All employees must comply with security policies
- Security awareness training is provided
- Departing employees must return all records and access is revoked

## Implications for AI/Data Projects
Based on discovery sessions (March 24 & 30, 2026):

### Service Account Architecture
- Adam Daube: "As long as we can weave in a service account, that would make security very happy. Anything we do should be logged, service accounted, with credentials and rotating tokens."
- Yorence Ramiz: "We're making a shift to get all this stuff really shored up and enterprise-grade security. Our SecOps is only two people."

### Sandbox-First Development
- DevTech plans to build in isolated sandbox environments with no production data editing
- Security reports will be generated and presented to SecOps for approval before production deployment
- Eden (SecOps) must be looped in for service account and permission pass-through design

### RBAC + ABAC Model
- Ariel Sofi proposed role-based + attribute-based access control for the Wes AI platform
- User tokens are passed through to the MCP server; the model itself has no independent agency
- Permissions must match the user's access level in the target system (STAR, SQL Server, etc.)

### Data Residency & LLM Considerations
- Client data transmitted to external LLM APIs must not be retained by the provider
- AI-generated artifacts (embeddings, vector stores, cached responses) must be treated as records under the retention policy
- Legal review required before using client engagement data for LLM fine-tuning or RAG retrieval
