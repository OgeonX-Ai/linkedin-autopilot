/**
 * Landing page — served at GET /
 * Shows product info, CTA to connect LinkedIn, and connection status if authenticated.
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

  const connectedBanner = isConnected
    ? `<div class="connected-banner">
        <span class="check">✅</span> Connected as <strong>${escapeHtml(displayName)}</strong>
        <a href="/routine/token" class="btn btn-secondary">Get Your Token</a>
        <a href="/auth/logout" class="btn btn-ghost">Disconnect</a>
      </div>`
    : `<a href="/auth/login" class="btn btn-primary">Connect Your LinkedIn</a>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OgeonX LinkedIn Autopilot</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0f1e;
      --surface: #111827;
      --surface2: #1c2740;
      --border: #1e3a5f;
      --accent: #0a7cff;
      --accent-hover: #1a8cff;
      --text: #e8edf5;
      --text-muted: #8898aa;
      --success: #22c55e;
      --radius: 12px;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    header {
      width: 100%;
      padding: 1.25rem 2rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .logo {
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
    }

    .logo span { color: var(--accent); }

    main {
      flex: 1;
      width: 100%;
      max-width: 860px;
      padding: 5rem 2rem 4rem;
      text-align: center;
    }

    .badge {
      display: inline-block;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.35rem 1rem;
      font-size: 0.8rem;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 2rem;
    }

    h1 {
      font-size: clamp(2.2rem, 5vw, 3.8rem);
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.03em;
      margin-bottom: 1.25rem;
    }

    h1 span { color: var(--accent); }

    .tagline {
      font-size: 1.2rem;
      color: var(--text-muted);
      max-width: 560px;
      margin: 0 auto 2.5rem;
      line-height: 1.6;
    }

    .cta-area { margin-bottom: 4rem; }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.85rem 2rem;
      border-radius: var(--radius);
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      transition: opacity 0.15s, transform 0.1s;
      cursor: pointer;
      border: none;
    }

    .btn:hover { opacity: 0.88; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }

    .btn-primary {
      background: var(--accent);
      color: #fff;
      font-size: 1.1rem;
      padding: 1rem 2.5rem;
    }

    .btn-secondary {
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--text);
    }

    .btn-ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
    }

    .connected-banner {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      justify-content: center;
      background: var(--surface);
      border: 1px solid var(--success);
      border-radius: var(--radius);
      padding: 1rem 1.5rem;
      font-size: 1rem;
    }

    .check { font-size: 1.25rem; }

    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
      text-align: left;
      margin-bottom: 4rem;
    }

    .feature-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      transition: border-color 0.2s;
    }

    .feature-card:hover { border-color: var(--accent); }

    .feature-icon { font-size: 2rem; margin-bottom: 0.75rem; }

    .feature-title {
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 0.4rem;
    }

    .feature-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    footer {
      padding: 2rem;
      text-align: center;
      font-size: 0.82rem;
      color: var(--text-muted);
      border-top: 1px solid var(--border);
      width: 100%;
    }

    @media (max-width: 480px) {
      main { padding: 3rem 1.25rem 2rem; }
      .connected-banner { flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">Ogeonx<span>X</span></div>
    <nav style="display:flex;gap:1rem;">
      <a href="/health" style="color:var(--text-muted);text-decoration:none;font-size:0.85rem;">Status</a>
    </nav>
  </header>

  <main>
    <div class="badge">AI-Powered LinkedIn Automation</div>

    <h1>OgeonX<br /><span>LinkedIn Autopilot</span></h1>

    <p class="tagline">
      Automate your LinkedIn presence. Post AI news, insights, and articles — automatically.
    </p>

    <div class="cta-area">
      ${connectedBanner}
    </div>

    <div class="features">
      <div class="feature-card">
        <div class="feature-icon">🤖</div>
        <div class="feature-title">Daily AI News Posts</div>
        <div class="feature-desc">Fresh AI and tech news curated and posted to your profile every morning.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">💡</div>
        <div class="feature-title">Wednesday Thought Leadership</div>
        <div class="feature-desc">Mid-week original insights that position you as an industry expert.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">📊</div>
        <div class="feature-title">Friday Weekly Roundup</div>
        <div class="feature-desc">A polished summary of the week's most important developments.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🔍</div>
        <div class="feature-title">Job Search Integration</div>
        <div class="feature-desc">Signal availability to your network with targeted, professional posts.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">📝</div>
        <div class="feature-title">Article Creation</div>
        <div class="feature-desc">Long-form LinkedIn articles drafted and published on your behalf.</div>
      </div>
    </div>
  </main>

  <footer>
    &copy; ${new Date().getFullYear()} OgeonX &mdash; Built with Claude AI
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
