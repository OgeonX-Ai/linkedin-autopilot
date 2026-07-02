/**
 * Landing page — served at GET /
 * Marketing page for OgeonX AI LinkedIn Autopilot.
 */

import { Hono } from "hono";
import { getSession } from "../auth/cookie.js";
import { getUser } from "../auth/user-registry.js";

export const landingRoutes = new Hono();

landingRoutes.get("/", (c) => {
  const session = getSession(c);
  const isConnected = Boolean(session?.accessToken && session.linkedinSub);
  const user = isConnected && session?.linkedinSub
    ? getUser(session.linkedinSub)
    : undefined;
  const displayName = user?.name || session?.linkedinName || "You";

  const ctaBlock = isConnected
    ? `<div class="connected-banner">
        <div class="connected-inner">
          <span class="check-icon">✓</span>
          <div>
            <div class="connected-label">Connected as <strong>${escapeHtml(displayName)}</strong></div>
            <div class="connected-sub">Your LinkedIn Autopilot is active</div>
          </div>
        </div>
        <div class="connected-actions">
          <a href="/dashboard" class="btn btn-secondary">View Dashboard</a>
          <a href="/routine/token" class="btn btn-secondary">Get API Token</a>
          <a href="/auth/logout" class="btn btn-ghost">Disconnect</a>
        </div>
      </div>`
    : `<div class="hero-cta">
        <a href="/auth/login" class="btn btn-primary">Connect LinkedIn &rarr;</a>
        <a href="https://github.com/OgeonX-Ai" class="btn btn-outline" target="_blank" rel="noopener">View on GitHub</a>
      </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OgeonX AI — LinkedIn Autopilot</title>
  <meta name="description" content="AI-powered LinkedIn automation. Post daily AI news, thought leadership, and weekly roundups automatically — as yourself or as your company page." />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #06090f;
      --bg2: #0d1117;
      --surface: #111827;
      --surface2: #1a2336;
      --border: #1e3a5f;
      --border2: #253c5e;
      --accent: #0a7cff;
      --accent2: #3b9eff;
      --text: #e8edf5;
      --text-muted: #8898aa;
      --text-dim: #4a5568;
      --success: #22c55e;
      --radius: 10px;
      --radius-lg: 16px;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      line-height: 1.6;
    }

    a { color: inherit; text-decoration: none; }

    /* ── Header ─────────────────────────────────────────────────── */
    header {
      position: sticky;
      top: 0;
      z-index: 100;
      width: 100%;
      padding: 1rem 2rem;
      background: rgba(6, 9, 15, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .logo {
      font-size: 1.05rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .logo .x { color: var(--accent); }
    .logo .tag {
      margin-left: 0.6rem;
      font-size: 0.65rem;
      font-weight: 600;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.15rem 0.55rem;
      color: var(--accent);
      vertical-align: middle;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .header-nav {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }
    .header-nav a {
      font-size: 0.85rem;
      color: var(--text-muted);
      transition: color 0.15s;
    }
    .header-nav a:hover { color: var(--text); }
    .header-nav .btn-sm {
      padding: 0.45rem 1.1rem;
      font-size: 0.85rem;
      background: var(--accent);
      color: #fff;
      border-radius: var(--radius);
      font-weight: 600;
      transition: opacity 0.15s;
    }
    .header-nav .btn-sm:hover { opacity: 0.85; }

    /* ── Buttons ─────────────────────────────────────────────────── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.8rem 1.8rem;
      border-radius: var(--radius);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s, transform 0.1s;
      white-space: nowrap;
    }
    .btn:hover { opacity: 0.88; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }

    .btn-primary {
      background: var(--accent);
      color: #fff;
      font-size: 1.05rem;
      padding: 0.9rem 2.2rem;
      box-shadow: 0 0 32px rgba(10, 124, 255, 0.3);
    }
    .btn-secondary {
      background: var(--surface2);
      border: 1px solid var(--border2);
      color: var(--text);
    }
    .btn-outline {
      background: transparent;
      border: 1px solid var(--border2);
      color: var(--text-muted);
    }
    .btn-ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-dim);
      font-size: 0.9rem;
      padding: 0.6rem 1.2rem;
    }

    /* ── Layout ─────────────────────────────────────────────────── */
    .container {
      max-width: 1080px;
      margin: 0 auto;
      padding: 0 2rem;
    }

    /* ── Hero ─────────────────────────────────────────────────── */
    .hero {
      padding: 7rem 2rem 5rem;
      text-align: center;
      background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(10, 124, 255, 0.12), transparent);
    }

    .hero-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.4rem 1.1rem;
      font-size: 0.78rem;
      color: var(--accent2);
      text-transform: uppercase;
      letter-spacing: 0.09em;
      font-weight: 600;
      margin-bottom: 2.5rem;
    }
    .hero-eyebrow::before { content: "●"; font-size: 0.6rem; color: var(--accent); }

    h1 {
      font-size: clamp(2.4rem, 6vw, 4.2rem);
      font-weight: 800;
      line-height: 1.08;
      letter-spacing: -0.04em;
      margin-bottom: 1.5rem;
      max-width: 820px;
      margin-left: auto;
      margin-right: auto;
    }
    h1 em {
      font-style: normal;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero-sub {
      font-size: 1.2rem;
      color: var(--text-muted);
      max-width: 580px;
      margin: 0 auto 3rem;
      line-height: 1.65;
    }

    .hero-cta {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .hero-note {
      margin-top: 1.25rem;
      font-size: 0.8rem;
      color: var(--text-dim);
    }

    /* Connected banner */
    .connected-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2rem;
      flex-wrap: wrap;
      max-width: 560px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--success);
      border-radius: var(--radius-lg);
      padding: 1.25rem 1.75rem;
    }
    .connected-inner { display: flex; align-items: center; gap: 1rem; }
    .check-icon {
      width: 2rem; height: 2rem;
      background: var(--success);
      color: #000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.9rem;
      flex-shrink: 0;
    }
    .connected-label { font-size: 0.95rem; }
    .connected-sub { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.1rem; }
    .connected-actions { display: flex; gap: 0.75rem; }

    /* ── Social proof strip ─────────────────────────────────────── */
    .proof-strip {
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      padding: 1.25rem 2rem;
      background: var(--bg2);
    }
    .proof-inner {
      max-width: 1080px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3rem;
      flex-wrap: wrap;
    }
    .proof-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.82rem;
      color: var(--text-muted);
    }
    .proof-item svg { opacity: 0.6; }

    /* ── Features ─────────────────────────────────────────────────── */
    .section {
      padding: 6rem 2rem;
    }
    .section-alt { background: var(--bg2); }

    .section-label {
      text-align: center;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 1rem;
    }

    h2 {
      font-size: clamp(1.8rem, 4vw, 2.8rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      text-align: center;
      margin-bottom: 1rem;
      line-height: 1.15;
    }

    .section-sub {
      text-align: center;
      color: var(--text-muted);
      font-size: 1.05rem;
      max-width: 520px;
      margin: 0 auto 3.5rem;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.25rem;
      max-width: 1080px;
      margin: 0 auto;
    }

    .feature-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 2rem;
      transition: border-color 0.2s, transform 0.2s;
    }
    .feature-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .feature-icon {
      width: 2.8rem; height: 2.8rem;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.3rem;
      margin-bottom: 1.25rem;
    }
    .feature-title {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .feature-desc {
      font-size: 0.875rem;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* ── How it works ─────────────────────────────────────────────── */
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 2rem;
      max-width: 900px;
      margin: 0 auto;
      position: relative;
    }

    .step {
      text-align: center;
      padding: 1rem;
    }
    .step-num {
      width: 3rem; height: 3rem;
      border: 2px solid var(--accent);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--accent);
      margin: 0 auto 1.25rem;
    }
    .step-title {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .step-desc {
      font-size: 0.875rem;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* ── Tech / open source callout ─────────────────────────────── */
    .callout {
      max-width: 700px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 2.5rem 3rem;
      text-align: center;
    }
    .callout-title {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 0.75rem;
    }
    .callout-desc {
      color: var(--text-muted);
      margin-bottom: 2rem;
      font-size: 0.95rem;
      line-height: 1.65;
    }
    .callout-stack {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: center;
      margin-bottom: 2rem;
    }
    .stack-tag {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.3rem 0.9rem;
      font-size: 0.78rem;
      color: var(--text-muted);
      font-family: "SF Mono", "Fira Code", monospace;
    }

    /* ── Footer ─────────────────────────────────────────────────── */
    footer {
      padding: 3rem 2rem;
      border-top: 1px solid var(--border);
      background: var(--bg2);
    }
    .footer-inner {
      max-width: 1080px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1.5rem;
    }
    .footer-copy {
      font-size: 0.82rem;
      color: var(--text-dim);
    }
    .footer-links {
      display: flex;
      gap: 1.5rem;
    }
    .footer-links a {
      font-size: 0.82rem;
      color: var(--text-muted);
      transition: color 0.15s;
    }
    .footer-links a:hover { color: var(--text); }

    /* ── Responsive ─────────────────────────────────────────────── */
    @media (max-width: 600px) {
      .hero { padding: 5rem 1.25rem 3.5rem; }
      .section { padding: 4rem 1.25rem; }
      .connected-banner { flex-direction: column; align-items: flex-start; }
      .callout { padding: 2rem 1.5rem; }
      .header-nav .nav-links { display: none; }
      .footer-inner { flex-direction: column; }
    }
  </style>
</head>
<body>

  <header>
    <div class="logo">Ogeonx<span class="x">X</span> AI <span class="tag">Beta</span></div>
    <nav class="header-nav">
      <span class="nav-links" style="display:flex;gap:1.5rem;">
        <a href="https://github.com/OgeonX-Ai" target="_blank" rel="noopener">GitHub</a>
        <a href="/health">Status</a>
      </span>
      <a href="/auth/login" class="btn-sm">Connect LinkedIn</a>
    </nav>
  </header>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-eyebrow">AI-Powered LinkedIn Automation</div>
    <h1>Your LinkedIn presence,<br /><em>on autopilot.</em></h1>
    <p class="hero-sub">
      Connect ChatGPT or Claude to your LinkedIn account. Get daily AI news posts,
      mid-week thought leadership, and Friday roundups — published automatically,
      on your personal profile or your company page.
    </p>
    ${ctaBlock}
    <p class="hero-note">No credit card. Self-hosted. Open source.</p>
  </section>

  <!-- Proof strip -->
  <div class="proof-strip">
    <div class="proof-inner">
      <div class="proof-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Posts as personal profile or company page
      </div>
      <div class="proof-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        LinkedIn Marketing Developer Platform approved
      </div>
      <div class="proof-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        MCP 2025 spec — works with ChatGPT &amp; Claude
      </div>
      <div class="proof-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Built in Finland 🇫🇮
      </div>
    </div>
  </div>

  <!-- Features -->
  <section class="section">
    <div class="container">
      <p class="section-label">What it does</p>
      <h2>Everything your LinkedIn needs,<br />running while you sleep.</h2>
      <p class="section-sub">Five content types, fully automated. No copy-paste. No daily logins.</p>

      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">📰</div>
          <div class="feature-title">Daily AI News</div>
          <div class="feature-desc">Curates a trending AI headline every morning and posts it with context — keeping you visible without lifting a finger.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">💡</div>
          <div class="feature-title">Thought Leadership</div>
          <div class="feature-desc">Mid-week opinion posts built around real news. Hook, insight, question — the LinkedIn format that drives comments and reach.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📊</div>
          <div class="feature-title">Weekly Roundup</div>
          <div class="feature-desc">Friday summaries that people save. Top 5 AI stories from the week, formatted for maximum engagement.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📝</div>
          <div class="feature-title">Long-form Articles</div>
          <div class="feature-desc">Give it a title and body — it formats, hashtags, and publishes. Google-indexed, profile-permanent content on demand.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🏢</div>
          <div class="feature-title">Company Page Posting</div>
          <div class="feature-desc">Every tool works for your company page too. One server, two audiences — your personal brand and your business brand.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🔑</div>
          <div class="feature-title">Your Credentials, Your Control</div>
          <div class="feature-desc">Self-hosted on your own infrastructure. Tokens never leave your server. No third-party SaaS holding your LinkedIn access.</div>
        </div>
      </div>
    </div>
  </section>

  <!-- How it works -->
  <section class="section section-alt">
    <div class="container">
      <p class="section-label">How it works</p>
      <h2>Three steps to automated LinkedIn.</h2>
      <p class="section-sub">From zero to posting in under 10 minutes.</p>

      <div class="steps">
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-title">Connect your LinkedIn</div>
          <div class="step-desc">OAuth 2.0 flow — click "Connect LinkedIn," approve once, done. Access token stored server-side, never exposed.</div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-title">Add OgeonX to ChatGPT or Claude</div>
          <div class="step-desc">Point your AI assistant at the MCP endpoint. It discovers all available tools automatically via the MCP protocol.</div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-title">Say the word</div>
          <div class="step-desc">"Post this week's AI roundup" or just let the scheduled routine run. Posts appear on LinkedIn — no confirmation needed.</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Open source callout -->
  <section class="section">
    <div class="container">
      <div class="callout">
        <div class="callout-title">Open source & self-hosted</div>
        <div class="callout-desc">
          OgeonX AI is built on open standards. Inspect the code, fork it, run it on your own infra.
          No lock-in. No black box. You own your LinkedIn automation.
        </div>
        <div class="callout-stack">
          <span class="stack-tag">TypeScript</span>
          <span class="stack-tag">Node.js</span>
          <span class="stack-tag">LinkedIn API v2</span>
          <span class="stack-tag">MCP 2025</span>
          <span class="stack-tag">Hono</span>
          <span class="stack-tag">Cloudflare Tunnel</span>
        </div>
        <a href="https://github.com/OgeonX-Ai" class="btn btn-secondary" target="_blank" rel="noopener">
          View source on GitHub &rarr;
        </a>
      </div>
    </div>
  </section>

  <footer>
    <div class="footer-inner">
      <div class="footer-copy">&copy; ${new Date().getFullYear()} OgeonX AI &mdash; Helsinki, Finland</div>
      <div class="footer-links">
        <a href="https://github.com/OgeonX-Ai" target="_blank" rel="noopener">GitHub</a>
        <a href="https://www.linkedin.com/company/135254511/" target="_blank" rel="noopener">LinkedIn</a>
        <a href="/health">Status</a>
        <a href="/auth/login">Connect</a>
      </div>
    </div>
  </footer>

</body>
</html>`;

  return c.html(html);
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
