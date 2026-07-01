# Incident Response Procedure

**Document ID:** ISMS-INC-001
**Version:** 1.0
**Date:** 2026-07-02
**Owner:** Kim Harjamäki (kim.harjamaki@prosimo.fi)
**Classification:** Internal
**Standard:** ISO/IEC 27002:2022 A.5.26, A.6.8

---

## 1. Purpose and Scope

This procedure defines how security incidents affecting OgeonX LinkedIn Autopilot are identified, classified, contained, eradicated, recovered from, and reviewed. It applies to all components within the ISMS scope as defined in `docs/iso27001/ISMS-OVERVIEW.md`.

---

## 2. Incident Classification

### 2.1 Severity Levels

| Severity | Name | Definition | Response SLA |
|---|---|---|---|
| **P1** | Critical | Active exploitation or confirmed compromise of credentials, secrets, or unauthorized posting | Immediate (within 2 hours) |
| **P2** | High | Strong evidence of attempted exploitation; partial credential exposure; unauthorized account access without confirmed posting | Within 8 hours |
| **P3** | Medium | Suspicious activity; potential vulnerability discovered but not exploited; data exposure limited to internal data | Within 48 hours |
| **P4** | Low | Policy violations without security impact; minor misconfigurations with no exposure; informational findings | Within 7 days |

### 2.2 Classification Examples

**P1 — Critical:**
- `LINKEDIN_CLIENT_SECRET` found in a public git commit or log file
- `SESSION_SECRET` confirmed leaked (e.g., found in error logs, public repository)
- Unauthorized posts made to a user's LinkedIn profile via the application
- Active session hijacking: authenticated requests from unrecognized IP addresses posting content
- `.sessions.json` or `.users.json` confirmed exfiltrated

**P2 — High:**
- Brute-force attempts against API key or admin secret endpoints detected in logs
- JWT with an invalid signature accepted (would indicate `timingSafeEqual` bypass)
- OAuth callback receiving codes from an unexpected LinkedIn app (potential app impersonation)
- `.sessions.json` or `.users.json` accessible due to misconfigured file permissions
- Unauthorized access to `/admin/users` endpoint

**P3 — Medium:**
- `ADMIN_SECRET` not configured in `.env` (admin endpoint unprotected, discovered during review)
- Cloudflare Tunnel URL exposed publicly without the operator's knowledge
- `npm audit` reveals a high-severity CVE in a dependency but no active exploit is known
- Unusual OAuth authorize requests from unknown redirect URIs

**P4 — Low:**
- `.env` file committed to a private repository (no public exposure)
- Session cleanup not running due to a bug (memory leak, no credential exposure)
- Missing rate limiting on posting endpoints (policy gap, no active exploitation)
- RSS feed content contained unexpected material that was posted before review

---

## 3. Contact and Escalation

| Role | Contact | Availability |
|---|---|---|
| Primary responder (ISMS Owner) | kim.harjamaki@prosimo.fi | Best-effort; response SLA 48 hours for non-emergency |
| LinkedIn Trust & Safety (unauthorized posts) | https://www.linkedin.com/help/linkedin/ask/TS-RPS | Via web form |
| LinkedIn Developer Support (app/API issues) | https://developer.linkedin.com/support | Via LinkedIn Developer Portal |
| Cloudflare Support (tunnel issues) | https://support.cloudflare.com | Via dashboard |

---

## 4. P1 Incident Response: Step-by-Step Procedure

### Phase 1: Identify and Declare

1. Confirm the incident is P1 severity using Section 2.2 criteria.
2. Record the declaration time, incident nature, and initial evidence in an incident log entry.
3. Notify impacted users if their LinkedIn accounts may have been affected.

### Phase 2: Contain

**Immediate containment actions (complete within 30 minutes):**

1. **Kill the MCP server:**
   ```bash
   # Find the process
   ps aux | grep "node dist/index"
   # Or use the process manager
   kill -9 <PID>
   ```

2. **Terminate the Cloudflare Tunnel:**
   ```bash
   # Stop cloudflared
   pkill cloudflared
   # Or if running as a service:
   systemctl stop cloudflared
   ```

3. **Revoke the LinkedIn application (if client secret is compromised):**
   - Log in to [LinkedIn Developer Portal](https://developer.linkedin.com)
   - Navigate to the affected application
   - Click "Regenerate" on the Client Secret
   - This immediately invalidates all existing access tokens issued by this application

4. **Rotate SESSION_SECRET (if SESSION_SECRET is compromised):**
   - Generate a new secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - Update `SESSION_SECRET` in `.env`
   - This invalidates all JWTs and session cookies

5. **Preserve evidence before any cleanup:**
   ```bash
   # Copy current state files for forensics
   cp .sessions.json incident-$(date +%Y%m%d-%H%M%S)-sessions.json.bak
   cp .users.json incident-$(date +%Y%m%d-%H%M%S)-users.json.bak
   # Preserve server logs
   cp server.log incident-$(date +%Y%m%d-%H%M%S)-server.log.bak
   ```

6. **Revoke API keys if any may be compromised:**
   - Clear `API_KEYS` in `.env`
   - New keys will be issued during recovery

### Phase 3: Eradicate

**Complete within 4 hours of containment:**

1. **Git history audit** — if secrets were committed to version control:
   ```bash
   # Search for credential patterns in all commits
   git log --all --full-history -p -- .env
   git log --all --full-history -S "LINKEDIN_CLIENT_SECRET" --oneline
   git log --all --full-history -S "SESSION_SECRET" --oneline
   ```
   - If secrets found in git history: use `git filter-branch` or `git filter-repo` to purge
   - Force-push the cleaned history if the repository is hosted on GitHub
   - File a GitHub support request to expire cached views if the repository is public

2. **Regenerate all compromised secrets:**
   - New `LINKEDIN_CLIENT_SECRET`: regenerate in LinkedIn Developer Portal
   - New `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - New `API_KEYS`: generate one new key per integration
   - New `ADMIN_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

3. **Review `.sessions.json` for unauthorized sessions:**
   - Open the file and examine each entry's `linkedinSub` and `expiresAt`
   - Delete entries for unrecognized `linkedinSub` values
   - Delete the file entirely if the scope of compromise is unclear: `rm .sessions.json`

4. **Review `.users.json` for unauthorized registrations:**
   - Inspect all entries; remove any `linkedinSub` values not recognized as legitimate users

5. **Review server logs for evidence of unauthorized actions:**
   - Search for unexpected `POST /mcp` calls, especially `postUpdate` tool calls
   - Cross-reference timestamps with LinkedIn activity in the affected user's LinkedIn account

6. **Patch the root cause:**
   - If a code vulnerability was exploited, create a fix, write a regression test, and commit it
   - If a configuration error was the cause, update the deployment runbook

### Phase 4: Recover

**Complete within 24 hours of eradication:**

1. **Update `.env` with all new secrets:**
   ```env
   SESSION_SECRET=<new-64-char-hex>
   LINKEDIN_CLIENT_SECRET=<new-secret-from-linkedin-portal>
   LINKEDIN_CLIENT_ID=<unchanged>
   API_KEYS=<new-comma-separated-keys>
   ADMIN_SECRET=<new-32-char-hex>
   LINKEDIN_REDIRECT_URI=<unchanged>
   SERVER_URL=<unchanged>
   ```

2. **Restart the server** with new secrets:
   ```bash
   node dist/index.js
   ```

3. **Verify startup security checks pass:**
   - Confirm log output: "Security checks passed — all required env vars present and valid"

4. **Restart Cloudflare Tunnel:**
   ```bash
   cloudflared tunnel run <tunnel-name>
   ```

5. **Distribute new API keys** to all integration clients (n8n, Zapier, etc.) via secure channels.

6. **Re-authenticate affected users:**
   - Notify users that they need to reconnect their LinkedIn account
   - Provide the URL: `https://<server-url>/auth/login`

7. **Verify LinkedIn posts** from affected accounts during the incident window:
   - Check LinkedIn activity feed for any unauthorized posts
   - If unauthorized posts are found, delete them immediately from LinkedIn

8. **Monitor for 24 hours** after recovery:
   - Watch server logs for any further suspicious activity
   - Check LinkedIn account(s) for unauthorized activity

### Phase 5: Post-Mortem

**Complete within 7 days of recovery:**

1. **Write incident report** containing:
   - Incident timeline (detection → containment → eradication → recovery)
   - Root cause analysis (5-whys or fishbone)
   - Data and systems affected
   - Actions taken at each phase
   - Effectiveness of detection and response
   - Lessons learned

2. **Update risk register** (`RISK-ASSESSMENT.md`) if the incident revealed an unidentified risk.

3. **Update this procedure** if any step was unclear, missing, or incorrect.

4. **Implement corrective controls** to prevent recurrence.

5. **Communicate outcomes** to affected users if their data was involved.

---

## 5. Reporting Unauthorized LinkedIn Posts

If unauthorized posts were made to a user's LinkedIn profile through the application:

1. **Delete the posts immediately** from LinkedIn (the affected user should do this directly in LinkedIn or via their LinkedIn settings).

2. **Report to LinkedIn Trust & Safety:**
   - URL: https://www.linkedin.com/help/linkedin/ask/TS-RPS
   - Provide: post URLs, timestamps, description of how the unauthorized posting occurred

3. **Notify the affected user** with:
   - What happened
   - What posts were made
   - What actions were taken
   - What they should do (change LinkedIn password, review third-party app access)

4. **Review LinkedIn third-party app permissions** for the affected account:
   - LinkedIn Settings → Data Privacy → Other applications → Permitted Services
   - Revoke the OgeonX application's access

---

## 6. GDPR Breach Notification (if applicable)

If the incident involves unauthorized access to or disclosure of personal data (LinkedIn name, email address, `linkedinSub` identifier from `.users.json`):

1. **Assess breach scope:** How many users are affected? What data was exposed?

2. **72-hour threshold:** Under GDPR Article 33, if the breach is likely to result in a risk to individuals' rights and freedoms, notify the relevant supervisory authority (Finland: Tietosuojavaltuutetun toimisto — https://tietosuoja.fi) within 72 hours of becoming aware.

3. **User notification (Article 34):** If the breach is likely to result in a high risk to individuals, notify affected users directly.

4. **Record the breach** regardless of notification obligation: maintain a breach register as required by GDPR Article 33(5).

---

## 7. Incident Log Template

```
Incident ID: INC-YYYY-MM-DD-NNN
Declared: YYYY-MM-DD HH:MM UTC
Severity: P1 / P2 / P3 / P4
Declared by: Kim Harjamäki

Summary:
[Brief description of what was detected and when]

Evidence:
[Log snippets, file states, screenshots, git hashes]

Timeline:
- HH:MM UTC — [event]
- HH:MM UTC — [action taken]

Root cause:
[Analysis of underlying cause]

Impact:
- Systems affected:
- Data potentially exposed:
- Users affected:
- LinkedIn posts made:

Actions taken:
[Detailed list]

Corrective actions:
[Follow-up items with owner and due date]

Status: Open / Contained / Resolved / Closed
Closed: YYYY-MM-DD HH:MM UTC
```

---

## 8. Review History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-02 | Kim Harjamäki | Initial incident response procedure |
