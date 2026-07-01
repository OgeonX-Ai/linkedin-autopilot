/**
 * Job search tool — aggregates remote jobs from Remotive.io and Finnish jobs from Indeed RSS.
 * Remotive API is free with no auth. Indeed RSS is public.
 */

export interface JobResult {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  source: string;
}

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location: string;
  job_type: string;
  publication_date: string;
  description: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

async function fetchRemotiveJobs(keyword: string): Promise<JobResult[]> {
  const params = new URLSearchParams({ search: keyword, limit: "10" });
  const url = `https://remotive.io/api/remote-jobs?${params.toString()}`;
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as RemotiveResponse;
    return (data.jobs ?? []).map((job) => ({
      title: job.title,
      company: job.company_name,
      location: job.candidate_required_location || "Remote",
      url: job.url,
      description: stripHtml(job.description).slice(0, 200),
      source: "Remotive",
    }));
  } catch {
    return [];
  }
}

async function fetchIndeedRssJobs(keyword: string, location: string): Promise<JobResult[]> {
  const params = new URLSearchParams({ q: keyword, l: location, sort: "date" });
  const url = `https://fi.indeed.com/rss?${params.toString()}`;
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    return parseRssItems(xml);
  } catch {
    return [];
  }
}

function parseRssItems(xml: string): JobResult[] {
  const items: JobResult[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] ?? "";
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const description = extractTag(block, "description");
    if (!title || !link) continue;
    items.push({
      title: decodeEntities(title),
      company: extractCompanyFromIndeed(description),
      location: "Finland",
      url: link.trim(),
      description: stripHtml(decodeEntities(description)).slice(0, 200),
      source: "Indeed FI",
    });
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`).exec(xml);
  return match ? (match[1] ?? match[2] ?? "") : "";
}

function extractCompanyFromIndeed(description: string): string {
  // Indeed RSS descriptions often contain company info before a dash
  const text = stripHtml(decodeEntities(description));
  const dash = text.indexOf(" - ");
  return dash !== -1 ? text.slice(0, dash).trim() : "Unknown";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function formatResults(jobs: JobResult[]): string {
  if (jobs.length === 0) {
    return "No jobs found matching your criteria.";
  }
  const lines = jobs.map((job, i) => {
    const desc = job.description ? `\n   ${job.description}` : "";
    return `${i + 1}. **${job.title}** — ${job.company}\n   Location: ${job.location} | Source: ${job.source}\n   URL: ${job.url}${desc}`;
  });
  return `Found ${jobs.length} job(s):\n\n${lines.join("\n\n")}`;
}

export async function searchJobsHandler(
  args: { keyword?: string; location?: string; remote?: boolean },
  _session: { accessToken?: string },
): Promise<{ isError: boolean; content: Array<{ type: "text"; text: string }> }> {
  const keyword = (args.keyword ?? "").trim() || "software developer";
  const location = (args.location ?? "Finland").trim();
  const remote = args.remote ?? false;

  const [remotiveJobs, indeedJobs] = await Promise.all([
    remote ? fetchRemotiveJobs(keyword) : Promise.resolve([]),
    fetchIndeedRssJobs(keyword, location),
  ]);

  // Merge: Indeed first (local relevance), then Remotive
  const merged = [...indeedJobs, ...remotiveJobs];
  const capped = merged.slice(0, 8);

  return {
    isError: false,
    content: [{ type: "text", text: formatResults(capped) }],
  };
}
