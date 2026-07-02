/**
 * Analytics dashboard — GET /dashboard
 * Shows the connected user's own post history: what the autopilot actually
 * published, when, and where. Does NOT show reach/engagement/follower counts —
 * the LinkedIn API scopes this server is approved for (w_member_social,
 * rw_organization_admin) don't expose post-level analytics, so those numbers
 * would have to be fabricated. We only render what we can verify ourselves.
 */

import { Hono } from "hono";
import { getSession } from "../auth/cookie.js";
import { getUser } from "../auth/user-registry.js";
import { getPostHistory, getPostStats } from "../analytics/post-history.js";
import type { PostType } from "../analytics/post-history.js";

export const dashboardRoutes = new Hono();

const TYPE_LABELS: Record<PostType, string> = {
  postUpdate: "Text Update",
  postAINews: "AI News",
  postThoughtLeadership: "Thought Leadership",
  postWeeklyRoundup: "Weekly Roundup",
  postArticle: "Article",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pageShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — OgeonX AI</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #06090f; --bg2: #0d1117; --surface: #111827; --surface2: #1a2336;
      --border: #1e3a5f; --border2: #253c5e; --accent: #0a7cff; --accent2: #3b9eff;
      --text: #e8edf5; --text-muted: #8898aa; --text-dim: #4a5568;
      --success: #22c55e; --radius: 10px; --radius-lg: 16px;
    }
    body {
      background: var(--bg); color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh; line-height: 1.6;
    }
    a { color: inherit; text-decoration: none; }
    header {
      position: sticky; top: 0; z-index: 100; width: 100%; padding: 1rem 2rem;
      background: rgba(6, 9, 15, 0.85); backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .logo { font-size: 1.05rem; font-weight: 800; letter-spacing: -0.02em; }
    .logo .x { color: var(--accent); }
    .header-nav { display: flex; align-items: center; gap: 1.5rem; }
    .header-nav a { font-size: 0.85rem; color: var(--text-muted); transition: color 0.15s; }
    .header-nav a:hover { color: var(--text); }
    .container { max-width: 1080px; margin: 0 auto; padding: 2.5rem 2rem 4rem; }
    h1 { font-size: 1.8rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 0.4rem; }
    .sub { color: var(--text-muted); font-size: 0.95rem; margin-bottom: 2.5rem; }
    .stat-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem; margin-bottom: 2.5rem;
    }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 1.5rem;
    }
    .stat-label { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem; }
    .stat-value { font-size: 2rem; font-weight: 800; letter-spacing: -0.02em; }
    .panel {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 1.75rem; margin-bottom: 1.5rem;
    }
    .panel-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 1.25rem; }
    .type-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.9rem;
    }
    .type-row:last-child { border-bottom: none; }
    .type-count { color: var(--accent2); font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { text-align: left; color: var(--text-muted); font-weight: 600; padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--border); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 0.7rem 0.5rem; border-bottom: 1px solid var(--border); vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .badge {
      display: inline-block; background: var(--surface2); border: 1px solid var(--border2);
      border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.72rem; color: var(--text-muted);
    }
    .badge-company { color: var(--accent2); border-color: var(--accent); }
    .preview { color: var(--text-muted); max-width: 360px; }
    .link { color: var(--accent2); }
    .empty { color: var(--text-dim); font-size: 0.9rem; padding: 1rem 0; }
    .note { color: var(--text-dim); font-size: 0.8rem; line-height: 1.6; }
    .cta { text-align: center; padding: 6rem 2rem; }
    .cta h1 { margin-bottom: 1rem; }
    .btn {
      display: inline-block; margin-top: 1.5rem; padding: 0.8rem 1.8rem;
      border-radius: var(--radius); background: var(--accent); color: #fff;
      font-weight: 600; font-size: 1rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">Ogeonx<span class="x">X</span> AI</div>
    <nav class="header-nav">
      <a href="/">Home</a>
      <a href="/health">Status</a>
    </nav>
  </header>
  ${body}
</body>
</html>`;
}

dashboardRoutes.get("/", (c) => {
  const session = getSession(c);
  const isConnected = Boolean(session?.accessToken && session.linkedinSub);

  if (!isConnected || !session?.linkedinSub) {
    return c.html(
      pageShell(
        "Dashboard",
        `<div class="cta">
          <h1>Connect LinkedIn to see your dashboard</h1>
          <p class="sub">Your post history shows up here once your autopilot is running.</p>
          <a href="/auth/login" class="btn">Connect LinkedIn &rarr;</a>
        </div>`,
      ),
    );
  }

  const ownerSub = session.linkedinSub;
  const stats = getPostStats(ownerSub);
  const recent = getPostHistory(ownerSub).slice(0, 25);
  const user = getUser(ownerSub);
  const displayName = user?.name || session.linkedinName || "You";

  const typeRows = (Object.entries(stats.postsByType) as Array<[PostType, number]>)
    .filter(([, count]) => count > 0)
    .map(
      ([type, count]) =>
        `<div class="type-row"><span>${escapeHtml(TYPE_LABELS[type])}</span><span class="type-count">${count}</span></div>`,
    )
    .join("");

  const tableRows = recent
    .map((r) => {
      const date = new Date(r.postedAt).toISOString().slice(0, 16).replace("T", " ");
      const badgeClass = r.target === "company" ? "badge badge-company" : "badge";
      return `<tr>
        <td>${date}</td>
        <td>${escapeHtml(TYPE_LABELS[r.type])}</td>
        <td><span class="${badgeClass}">${r.target}</span></td>
        <td class="preview">${escapeHtml(r.textPreview)}</td>
        <td><a class="link" href="${escapeHtml(r.linkedinPostUrl)}" target="_blank" rel="noopener">View &rarr;</a></td>
      </tr>`;
    })
    .join("");

  const body = `<div class="container">
    <h1>Welcome back, ${escapeHtml(displayName)}</h1>
    <p class="sub">Your LinkedIn Autopilot post history.</p>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Total posts</div>
        <div class="stat-value">${stats.totalPosts}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Posts this week</div>
        <div class="stat-value">${stats.postsThisWeek}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Posts by type</div>
      ${typeRows || '<div class="empty">No posts yet.</div>'}
    </div>

    <div class="panel">
      <div class="panel-title">Recent posts</div>
      ${
        recent.length > 0
          ? `<table>
              <thead><tr><th>Date</th><th>Type</th><th>Target</th><th>Preview</th><th></th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>`
          : '<div class="empty">Nothing posted yet — once your autopilot runs, it shows up here.</div>'
      }
    </div>

    <p class="note">
      This dashboard shows only what the autopilot itself has published — LinkedIn's API doesn't
      grant this app access to post-level reach, engagement, or follower analytics, so those
      numbers aren't shown here (rather than shown as estimates).
    </p>
  </div>`;

  return c.html(pageShell("Dashboard", body));
});
