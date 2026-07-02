import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchJobsHandler } from "./search-jobs.js";

// We intercept the global fetch used inside search-jobs.ts
const mockFetch = vi.fn();

vi.stubGlobal("fetch", mockFetch);

function makeRssXml(items: Array<{ title: string; link: string; description: string }>): string {
  const itemsXml = items
    .map(
      (item) =>
        `<item><title><![CDATA[${item.title}]]></title><link>${item.link}</link><description><![CDATA[${item.description}]]></description></item>`,
    )
    .join("\n");
  return `<?xml version="1.0"?><rss version="2.0"><channel>${itemsXml}</channel></rss>`;
}

function makeRemotiveResponse(jobs: Array<{ title: string; company_name: string; url: string }>): string {
  const fullJobs = jobs.map((j) => ({
    id: 1,
    url: j.url,
    title: j.title,
    company_name: j.company_name,
    candidate_required_location: "Worldwide",
    job_type: "full_time",
    publication_date: "2024-01-01",
    description: "<p>Great role</p>",
  }));
  return JSON.stringify({ jobs: fullJobs });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("searchJobsHandler()", () => {
  it("returns formatted job results from Indeed RSS", async () => {
    const rssXml = makeRssXml([
      {
        title: "Senior TypeScript Developer",
        link: "https://fi.indeed.com/job/123",
        description: "Acme Corp - Great job opportunity",
      },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => rssXml,
    });

    const result = await searchJobsHandler({ keyword: "typescript", location: "Helsinki" }, {});

    expect(result.isError).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const text = result.content[0]!.text;
    expect(text).toContain("Senior TypeScript Developer");
    expect(text).toContain("fi.indeed.com");
  });

  it("passes keyword and location to the Indeed RSS fetch URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => makeRssXml([]),
    });

    await searchJobsHandler({ keyword: "python", location: "Tampere" }, {});

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("python");
    expect(calledUrl).toContain("Tampere");
  });

  it("also fetches Remotive when remote:true and merges results", async () => {
    const rssXml = makeRssXml([
      {
        title: "Local Dev",
        link: "https://fi.indeed.com/job/local",
        description: "LocalCorp - local job",
      },
    ]);
    const remotiveJobs = JSON.parse(
      makeRemotiveResponse([
        { title: "Remote Engineer", company_name: "RemoteCo", url: "https://remotive.io/job/42" },
      ])
    ) as { jobs: unknown[] };

    // Route by URL since Promise.all fires both concurrently
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("remotive.io")) {
        return Promise.resolve({ ok: true, json: async () => remotiveJobs });
      }
      return Promise.resolve({ ok: true, text: async () => rssXml });
    });

    const result = await searchJobsHandler(
      { keyword: "engineer", location: "Helsinki", remote: true },
      {},
    );

    expect(result.isError).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const text = result.content[0]!.text;
    expect(text).toContain("Local Dev");
    expect(text).toContain("Remote Engineer");
  });

  it("returns no-results message when fetch fails gracefully", async () => {
    // Simulate network error — fetch throws
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await searchJobsHandler({ keyword: "java", location: "Oulu" }, {});

    expect(result.isError).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const text = result.content[0]!.text;
    expect(text).toContain("No jobs found");
  });

  it("returns no-results message when API returns non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    const result = await searchJobsHandler({ keyword: "rust", location: "Espoo" }, {});

    expect(result.isError).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toContain("No jobs found");
  });

  it("uses default keyword when none supplied", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => makeRssXml([]),
    });

    await searchJobsHandler({}, {});

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("software+developer");
  });
});
