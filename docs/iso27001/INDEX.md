# ISO 27001 ISMS Documentation Index

**System:** OgeonX LinkedIn Autopilot
**Standard:** ISO/IEC 27001:2022 / ISO/IEC 27002:2022
**Maintained by:** Kim Harjamäki (kim.harjamaki@prosimo.fi)
**Last updated:** 2026-07-02

---

## Documents

| Document | File | Description |
|---|---|---|
| **ISMS Overview** | [ISMS-OVERVIEW.md](ISMS-OVERVIEW.md) | ISMS scope, objectives (CIA), applicability of ISO 27001:2022 clauses 4–10, roles and responsibilities, information security policy, and annual review schedule |
| **Risk Assessment** | [RISK-ASSESSMENT.md](RISK-ASSESSMENT.md) | ISO 27001 Annex A-aligned risk register covering 12 identified risks (OAuth token theft, secret exposure, shell injection, session fixation, admin endpoint exposure, and more) with likelihood/impact scoring, current controls, residual risk, and treatment decisions |
| **Security Controls** | [SECURITY-CONTROLS.md](SECURITY-CONTROLS.md) | Mapping of all implemented security controls to ISO/IEC 27002:2022 Annex A control numbers (A.5–A.8), with implementation details, source file references, and identified gaps |
| **Access Control Policy** | [ACCESS-CONTROL.md](ACCESS-CONTROL.md) | Authentication model (JWT Bearer, API key, signed session cookie), privilege levels (anonymous/authenticated/admin), token lifecycle and revocation procedures, LinkedIn API scope rationale, and API key management guide |
| **Incident Response** | [INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md) | P1–P4 incident classification with examples, step-by-step P1 response procedure (contain, eradicate, recover, post-mortem), GDPR breach notification guidance, LinkedIn Trust & Safety reporting, and incident log template |
| **Data Classification** | [DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md) | Data inventory for all 10 data elements (tokens, secrets, PII, post content), GDPR applicability and data subject rights, retention schedule, and cross-border transfer disclosures |

---

## Quick Reference: Key Security Properties

| Property | Implementation |
|---|---|
| Secrets never leave server | LinkedIn tokens stored in `sessionStore`; never in MCP responses |
| Authentication | HMAC-SHA256 signed cookies, HS256 JWT, API key — all using `timingSafeEqual` |
| Startup validation | `config.ts` enforces presence and minimum length of all secrets; server exits on failure |
| CSRF protection | `crypto.randomBytes(16)` OAuth state; single-use pending request maps |
| Shell injection prevention | `spawnSync` with `shell: false`; validated `repoPath` |
| Error sanitization | `LINKEDIN_CLIENT_SECRET` redacted from all error outputs |
| PKCE | Not currently enabled — LinkedIn does not enable it by default for this app tier |
| Data at rest encryption | Not implemented — planned for `.sessions.json` |
| Rate limiting | Not implemented — identified in RISK-009 and RISK-012 as treatment actions |

---

## Document Status

| Document | Status | Next Review |
|---|---|---|
| ISMS-OVERVIEW.md | Current | 2027-07-02 |
| RISK-ASSESSMENT.md | Current | 2027-07-02 |
| SECURITY-CONTROLS.md | Current | 2027-07-02 |
| ACCESS-CONTROL.md | Current | 2027-07-02 |
| INCIDENT-RESPONSE.md | Current | 2027-07-02 |
| DATA-CLASSIFICATION.md | Current | 2027-07-02 |
