/**
 * Post a thought-leadership insight about AI/tech trends.
 * Fetches recent AI news for context, then composes an opinion-style post
 * that drives engagement (questions, perspectives, not just news sharing).
 *
 * Engagement-optimized format based on 2026 LinkedIn algorithm research:
 * - Hook in first line (no "I" start, curiosity gap)
 * - Short paragraphs (mobile-first)
 * - Ends with a question to drive comments
 * - Saves-worthy insight (the #1 reach signal in 2026)
 */

import { LinkedInClient, LinkedInApiError } from "../linkedin/client.js";
import { recordPost } from "../analytics/post-history.js";

const INSIGHT_FEEDS = [
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  "https://www.technologyreview.com/feed/",
];

interface NewsItem { title: string; description: string; link: string }

function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const pattern = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = pattern.exec(xml)) !== null) {
    const block = m[1] ?? "";
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`).exec(block);
      return (r?.[1] ?? r?.[2] ?? "").trim();
    };
    const title = get("title");
    const link = get("link");
    const description = get("description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200);
    if (title && link) items.push({ title, link, description });
  }
  return items;
}

async function fetchNewsContext(): Promise<NewsItem | null> {
  for (const feed of INSIGHT_FEEDS) {
    try {
      const res = await fetch(feed, {
        headers: { "User-Agent": "LinkedInMCP/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const items = parseRss(await res.text());
      // Pick item #2 or #3 to avoid duplicating the daily news post (which takes #1)
      const item = items[2] ?? items[1] ?? items[0];
      if (item) return item;
    } catch { /* try next */ }
  }
  return null;
}

function composeThoughtLeadership(news: NewsItem): string {
  // Hook → context → insight → question format (personal voice)
  const lines = [
    `The AI landscape is shifting faster than most realize.`,
    ``,
    `${news.title}`,
    ``,
    `${news.description.slice(0, 180)}`,
    ``,
    `Here's what this means for professionals in Finland and across Europe:`,
    ``,
    `→ The gap between AI-native and traditional approaches is widening`,
    `→ The companies adapting now will define their industries in 3 years`,
    `→ The real competitive advantage isn't the tool — it's knowing how to use it`,
    ``,
    `What's your take — are you seeing AI adoption accelerate in your field?`,
    ``,
    `#AI #FutureOfWork #Innovation #Finland #TechTrends #ArtificialIntelligence`,
  ];
  return lines.join("\n").slice(0, 3000);
}

function composeThoughtLeadershipCompany(news: NewsItem): string {
  // Company voice — OgeonX AI brand, solution-aware, CTA to follow
  const lines = [
    `At OgeonX AI, we track the AI landscape so you don't have to.`,
    ``,
    `This week caught our attention: ${news.title}`,
    ``,
    `${news.description.slice(0, 200)}`,
    ``,
    `What this means for businesses automating their LinkedIn presence:`,
    ``,
    `→ AI-first companies are gaining an asymmetric advantage in content output`,
    `→ Professionals who automate distribution will reach 10x more of their network`,
    `→ The bottleneck isn't ideas — it's consistent, high-quality execution`,
    ``,
    `OgeonX AI automates LinkedIn posting for founders, executives, and teams who can't afford to go quiet on their audience.`,
    ``,
    `Which of these AI shifts are you most focused on this year?`,
    ``,
    `Follow OgeonX AI for daily AI insights →`,
    ``,
    `#OgeonXAI #AI #LinkedInAutomation #FutureOfWork #MarketingAutomation #ArtificialIntelligence`,
  ];
  return lines.join("\n").slice(0, 3000);
}

export async function postThoughtLeadershipHandler(
  _args: Record<string, unknown>,
  session: { accessToken?: string; linkedinSub?: string; orgId?: string },
): Promise<{ isError: boolean; content: Array<{ type: "text"; text: string }> }> {
  if (!session.accessToken || (!session.linkedinSub && !session.orgId)) {
    return {
      isError: true,
      content: [{ type: "text", text: "Not authenticated. Visit /auth/login to connect LinkedIn." }],
    };
  }

  const news = await fetchNewsContext();
  if (!news) {
    return {
      isError: true,
      content: [{ type: "text", text: "Could not fetch news context. Try again later." }],
    };
  }

  const text = session.orgId
    ? composeThoughtLeadershipCompany(news)
    : composeThoughtLeadership(news);
  const authorUrn = session.orgId
    ? `urn:li:organization:${session.orgId}`
    : `urn:li:person:${session.linkedinSub}`;
  const client = new LinkedInClient();

  try {
    const post = await client.createPost(session.accessToken, authorUrn, text);
    recordPost({
      type: "postThoughtLeadership",
      target: session.orgId ? "company" : "personal",
      ownerSub: session.linkedinSub,
      text,
      linkedinPostId: post.postId,
      linkedinPostUrl: post.postUrl,
    });
    return {
      isError: false,
      content: [{
        type: "text",
        text: `✅ Thought leadership post published!\n\nBased on: ${news.title}\nURL: ${post.postUrl}`,
      }],
    };
  } catch (err) {
    const message = err instanceof LinkedInApiError ? err.message : "Unexpected error.";
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
