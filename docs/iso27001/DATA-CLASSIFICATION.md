# Data Classification and Handling

**Document ID:** ISMS-DAT-001
**Version:** 1.0
**Date:** 2026-07-02
**Owner:** Kim Harjamäki (kim.harjamaki@prosimo.fi)
**Classification:** Internal
**Standards:** ISO/IEC 27002:2022 A.5.12, A.5.13, A.8.10; GDPR (EU) 2016/679

---

## 1. Classification Scheme

| Level | Definition | Handling Requirements |
|---|---|---|
| **Public** | Information intended for unrestricted public disclosure | No restrictions on access or transmission |
| **Internal** | Information for internal use; limited disclosure harm | Share within authorized roles; do not publish externally |
| **Confidential** | Sensitive business information; disclosure causes limited harm | Encrypt in transit; restrict access to named individuals; do not log |
| **Restricted** | Credentials and secrets; disclosure causes severe harm | Never log; never transmit in cleartext; store only in designated locations; treat any exposure as a security incident |

---

## 2. Data Inventory

### 2.1 LinkedIn OAuth Access Token

| Attribute | Value |
|---|---|
| **Classification** | Restricted |
| **Description** | Short-lived bearer token issued by LinkedIn after successful OAuth flow; grants posting access to user's LinkedIn account |
| **Format** | Opaque string (LinkedIn-issued) |
| **Storage at rest** | Server-side in-memory `sessionStore` Map; persisted to `.sessions.json` on the host filesystem |
| **Storage in transit** | Transmitted only between OgeonX server and LinkedIn API v2 over TLS; never sent to MCP clients, AI agents, or browsers |
| **Retention** | Expires approximately 60 days after issuance (LinkedIn-determined); purged from `sessionStore` 1 hour after expiry; present in `.sessions.json` until next server restart or explicit deletion |
| **GDPR relevance** | No — the token itself is not personal data; it is a credential |
| **Handling rules** | Never log; never include in HTTP responses; never transmit to AI agents; store only in `sessionStore` and `.sessions.json` |

---

### 2.2 LinkedIn Refresh Token

| Attribute | Value |
|---|---|
| **Classification** | Restricted |
| **Description** | Long-lived token allowing renewal of access tokens without re-authentication; not always issued by LinkedIn for this app tier |
| **Format** | Opaque string (LinkedIn-issued) |
| **Storage at rest** | Same as access token: `sessionStore` and `.sessions.json` |
| **Storage in transit** | Used only in server-to-LinkedIn token refresh calls over TLS |
| **Retention** | Indefinite until revoked via LinkedIn Developer Portal or deleted from `.sessions.json` |
| **GDPR relevance** | No |
| **Handling rules** | Same as access token; additionally: revoke at LinkedIn if user requests data deletion |

---

### 2.3 SESSION_SECRET

| Attribute | Value |
|---|---|
| **Classification** | Restricted |
| **Description** | HMAC-SHA256 signing key for all JWTs and session cookies; minimum 32 characters; compromise enables full authentication bypass |
| **Format** | Arbitrary string (minimum 32 characters; recommended: 64-char hex) |
| **Storage at rest** | `.env` file on host filesystem only |
| **Storage in transit** | Never transmitted; used only in server-side cryptographic operations |
| **Retention** | Indefinite; rotate annually or upon suspected compromise |
| **GDPR relevance** | No |
| **Handling rules** | Never log; never include in any output; `config.ts` validates presence and minimum length at startup; rotation invalidates all active sessions |

---

### 2.4 LINKEDIN_CLIENT_SECRET

| Attribute | Value |
|---|---|
| **Classification** | Restricted |
| **Description** | OAuth 2.0 client secret for the LinkedIn application registration; compromise allows token issuance in the application's name |
| **Format** | Alphanumeric string (LinkedIn-issued) |
| **Storage at rest** | `.env` file on host filesystem only |
| **Storage in transit** | Transmitted only in server-to-LinkedIn token exchange requests over TLS (`application/x-www-form-urlencoded` POST body) |
| **Retention** | Indefinite; rotate via LinkedIn Developer Portal if compromised |
| **GDPR relevance** | No |
| **Handling rules** | Never log; `sanitizeErrors` middleware actively redacts this value from all error responses; `exchangeCode()` and `refreshAccessToken()` document that raw responses containing it are never passed to loggers |

---

### 2.5 API_KEYS

| Attribute | Value |
|---|---|
| **Classification** | Restricted |
| **Description** | Pre-shared keys granting authenticated access to all MCP tools; issued to integration clients (n8n, Zapier, direct HTTP) |
| **Format** | Comma-separated list of hex strings (recommended: 64 characters each) |
| **Storage at rest** | `.env` file on host filesystem; integration client's own secure credential store |
| **Storage in transit** | Transmitted in `X-API-Key` request header over TLS |
| **Retention** | Indefinite; rotate annually or upon client offboarding |
| **GDPR relevance** | No |
| **Handling rules** | Never log; never include in responses; verified using `timingSafeEqual` per key |

---

### 2.6 ADMIN_SECRET

| Attribute | Value |
|---|---|
| **Classification** | Restricted |
| **Description** | Bearer credential for the `/admin/users` endpoint; grants read access to the user registry |
| **Format** | Arbitrary string (minimum recommended: 32 characters) |
| **Storage at rest** | `.env` file only |
| **Storage in transit** | Transmitted in `X-Admin-Secret` request header over TLS |
| **Retention** | Indefinite; rotate if compromised |
| **GDPR relevance** | No — but admin endpoint returns personal data (see 2.7) |
| **Handling rules** | Never log; verified using `timingSafeEqual` |

---

### 2.7 User Name and Email (LinkedIn Profile Data)

| Attribute | Value |
|---|---|
| **Classification** | Internal |
| **Description** | LinkedIn display name and email address retrieved from LinkedIn OIDC `/v2/userinfo` endpoint after OAuth authentication |
| **Format** | Strings; email in standard format |
| **Storage at rest** | `.users.json` on host filesystem; in-memory `userRegistry` Map; in `sessionStore` as `linkedinName` and `linkedinEmail` fields |
| **Storage in transit** | Transmitted from LinkedIn API to OgeonX server over TLS; returned by `/admin/users` to admin clients over TLS |
| **Retention** | Indefinite until user requests deletion or the file is manually cleared |
| **GDPR relevance** | **Yes** — name and email are personal data under GDPR Article 4(1). Legal basis for processing: consent (user initiates OAuth flow). |
| **Handling rules** | Do not expose to unauthenticated callers; do not log raw email addresses; honor deletion requests (see Section 4) |

---

### 2.8 LinkedIn Sub Identifier (linkedinSub)

| Attribute | Value |
|---|---|
| **Classification** | Internal |
| **Description** | Stable LinkedIn person identifier from OIDC `sub` claim (format: `urn:li:person:<id>` or numeric); uniquely identifies a LinkedIn member |
| **Format** | String |
| **Storage at rest** | `sessionStore`, `.sessions.json`, `.users.json` |
| **Storage in transit** | Used internally on server; not transmitted to MCP clients |
| **Retention** | Same as associated user record |
| **GDPR relevance** | **Yes** — a pseudonymous identifier tied to a natural person; constitutes personal data under GDPR |
| **Handling rules** | Same as user name and email |

---

### 2.9 Post Content

| Attribute | Value |
|---|---|
| **Classification** | Public |
| **Description** | Text and link content composed by AI agents and submitted to LinkedIn via `postUpdate`, `postArticle`, etc. |
| **Format** | Plain text string, 1–3000 characters |
| **Storage at rest** | Not stored on OgeonX server; submitted directly to LinkedIn API and stored by LinkedIn |
| **Storage in transit** | Transmitted from MCP client to OgeonX server to LinkedIn API, all over TLS |
| **Retention** | Not retained by OgeonX; LinkedIn retains indefinitely per LinkedIn's data policy |
| **GDPR relevance** | No — published to LinkedIn as public content by user intent |
| **Handling rules** | Validate length (1–3000 chars) before submission; not logged in plaintext |

---

### 2.10 OAuth Authorization Codes (Transient)

| Attribute | Value |
|---|---|
| **Classification** | Restricted |
| **Description** | Short-lived codes used in ChatGPT OAuth flow (`/oauth/callback` → `/oauth/token`); each code is single-use and expires in 5 minutes |
| **Format** | 64-character hex string (32 bytes of `crypto.randomBytes`) |
| **Storage at rest** | Server-side in-memory `authCodes` Map only; never written to disk |
| **Storage in transit** | Transmitted as URL parameter over TLS |
| **Retention** | 5 minutes; deleted immediately upon use |
| **GDPR relevance** | No |
| **Handling rules** | Single-use; time-limited; never logged |

---

## 3. Data Storage Security Requirements

| Storage Location | Classification Stored | Security Requirements |
|---|---|---|
| `.env` | Restricted | Not committed to git; read-only to server process; excluded from backups unless encrypted |
| `.sessions.json` | Restricted | Not committed to git; filesystem read restricted to server user; backed up only to encrypted storage |
| `.users.json` | Internal | Not committed to git; subject to GDPR deletion requests |
| `sessionStore` (in-memory) | Restricted | In server process memory only; cleared on restart; auto-purged after 1 hour past expiry |
| `authCodes` Map (in-memory) | Restricted | In server process memory only; single-use and 5-minute TTL |
| `pendingAuthRequests` Map (in-memory) | Internal | In server process memory only; deleted on use |

---

## 4. GDPR Considerations

### 4.1 Personal Data Processed

The following fields constitute personal data under GDPR Article 4(1):

| Data Element | GDPR Category | Legal Basis |
|---|---|---|
| `linkedinName` | Ordinary personal data | Consent (OAuth authorization by the data subject) |
| `linkedinEmail` | Ordinary personal data | Consent (OAuth authorization by the data subject) |
| `linkedinSub` | Pseudonymous identifier | Consent (OAuth authorization by the data subject) |

### 4.2 Data Subject Rights

**Right of access (Article 15):** A user may request a copy of their data held in `.users.json` and `.sessions.json`. The owner provides this within 30 days upon request to kim.harjamaki@prosimo.fi.

**Right to erasure (Article 17):** A user may request deletion of their data. The operator must:
1. Locate the user's entry in `.users.json` by `linkedinSub`
2. Delete that entry from `.users.json`
3. Locate and delete the user's entry in `.sessions.json`
4. Confirm deletion to the user in writing

**Right to rectification (Article 16):** User profile data (name, email) is sourced from LinkedIn at authentication time and refreshed on re-authentication; the user corrects their LinkedIn profile directly at LinkedIn.

**Right to data portability (Article 20):** User data in `.users.json` can be exported as JSON on request.

### 4.3 Data Minimization (Article 5(1)(c))

Only the data necessary for the application's function is collected:
- `linkedinName` and `linkedinEmail` are stored to enable user identification in the admin interface and the landing page display name
- `linkedinSub` is the minimal stable identifier needed to associate sessions with users

### 4.4 Data Controller Information

- **Data Controller:** Kim Harjamäki, operating OgeonX AI
- **Contact:** kim.harjamaki@prosimo.fi
- **Processing purpose:** LinkedIn automation tools for the data subject's own LinkedIn account

---

## 5. Data Retention Schedule

| Data | Retention Period | Deletion Trigger |
|---|---|---|
| LinkedIn access tokens | Until expiry + 1 hour (auto-purge) | Automatic via `purgeExpiredSessions()` interval |
| LinkedIn refresh tokens | Indefinite until revoked | Manual deletion from `.sessions.json`; or LinkedIn revocation |
| User name and email | Indefinite | Manual deletion on GDPR erasure request; or manual `.users.json` edit |
| LinkedIn sub identifier | Indefinite | Same as user name/email |
| OAuth auth codes | 5 minutes | Single-use; auto-expired |
| Post content | Not retained | Never stored |
| Session cookies | 7 days browser-side; indefinite server-side | Server-side: logout, restart, or purge timer; browser-side: Max-Age=604800 |

---

## 6. Cross-Border Data Transfers

| Destination | Data Transferred | Transfer Mechanism | Location |
|---|---|---|---|
| LinkedIn API v2 (`api.linkedin.com`) | Access tokens, post content, profile read requests | Standard contractual clauses via LinkedIn's API Terms | United States |
| LinkedIn OAuth server (`linkedin.com/oauth`) | Authorization codes, client credentials | Standard contractual clauses via LinkedIn's API Terms | United States |
| Remotive.io (job search) | HTTP GET request (no personal data) | Standard HTTPS | United States |
| Indeed RSS feed | HTTP GET request (no personal data) | Standard HTTPS | Varies |
| TechCrunch RSS | HTTP GET request (no personal data) | Standard HTTPS | United States |
| MIT Tech Review RSS | HTTP GET request (no personal data) | Standard HTTPS | United States |
| O'Reilly RSS | HTTP GET request (no personal data) | Standard HTTPS | United States |
| Cloudflare Tunnel | Encrypted TLS traffic (header metadata only) | Cloudflare's DPA | United States / EU |

**Note:** LinkedIn's data processing is governed by the LinkedIn API Terms of Service and LinkedIn's Privacy Policy, which include EU Standard Contractual Clauses for data transfers from the EEA to the US.

---

## 7. Review History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-02 | Kim Harjamäki | Initial data classification |
