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
