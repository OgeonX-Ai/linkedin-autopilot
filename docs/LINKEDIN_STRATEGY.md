# LinkedIn Growth Strategy

A practical guide to using OgeonX LinkedIn Autopilot for two specific goals:
getting customers for your business and finding a job as a developer.
The tactics in this guide are grounded in how LinkedIn's 2026 algorithm actually
distributes content — not how it worked in 2022.

---

## Getting customers with automated LinkedIn

### Post cadence: 3-4 times per week

The recommended schedule is:

| Day | Tool | Post type | Why |
|-----|------|-----------|-----|
| Monday | `postAINews` | AI news item | Positions you as an informed voice at the start of the working week |
| Wednesday | `postThoughtLeadership` | Opinion + closing question | Wednesday 16:00 EET is the peak slot for Finnish B2B — highest recruiter and decision-maker traffic |
| Friday | `postWeeklyRoundup` | Top 5 AI stories | Save-worthy content. People save Friday roundups to read over the weekend |
| (Optional) Thursday | `postUpdate` or `postArticle` | Anything you're building | If you have a release, case study, or blog post to share |

Posting 3-4x per week consistently outperforms posting daily. LinkedIn's algorithm
penalizes sudden bursts of activity followed by silence. Consistency over volume.

### Content that converts to customers

**Thought leadership beats news sharing.** A news post says "look what I found."
A thought leadership post says "here is what this means for your business — and here
is what I would do about it." Customers hire experts, not aggregators.

Use the weekly cadence to show the progression:
- Monday: "Here is what happened in AI this week"
- Wednesday: "Here is what it means and what smart companies are doing about it"
- Friday: "Here are the five things worth knowing going into next week"

This narrative arc makes you the go-to person in your niche without requiring daily
manual effort.

### Using `postArticle` with `sourceUrl` for rich link previews

When you publish a blog post, release notes, or a GitHub page, use `postArticle` with
the `sourceUrl` parameter set to the URL. This generates a rich link preview card
(title + image + domain) instead of a plain text URL.

Rich previews get significantly higher click-through rates than bare URLs because they
display above the fold without the reader having to expand the post.

**Important:** The URL in `sourceUrl` populates the article card. The post body
(`body` parameter) is the commentary text that appears above the card. Do not repeat
the URL in the body text — the card already shows it. Keep the body focused on the
insight or announcement.

Example workflow:

```
User: "I just published a blog post about MCP at https://myblog.com/mcp-guide"

ChatGPT with GPT action:
  → postArticle({
      title: "A Practical Guide to MCP Servers",
      body: "I spent two weeks building an MCP server that connects ChatGPT to LinkedIn...",
      topic: "ai",
      sourceUrl: "https://myblog.com/mcp-guide"
    })
```

### Hashtag strategy for bilingual reach

Mix Finnish and global hashtags to reach both audiences:

**Finnish-language posts:**
```
#Tekoäly #Suomi #Teknologia #Ohjelmistokehitys #Startup
```

**English-language posts:**
```
#AI #MCP #ModelContextProtocol #BuildInPublic #AITools
```

**Rule:** Use 3-5 hashtags maximum. LinkedIn's algorithm treats hashtag stuffing
(10+ hashtags) as low-quality content and reduces distribution. Three relevant
hashtags outperform fifteen generic ones.

**Bilingual strategy:** Post Monday AI news in Finnish (reaches Finnish decision-makers
who prefer native-language content). Post Wednesday thought leadership in English
(reaches the international audience that follows Finnish AI topics).

### CTA in every post

End every post with a single question. Not a generic "What do you think?" but a
specific, answerable question that the target customer would have an opinion on.

Examples:
- "How is your team using AI agents in production today?"
- "What is the biggest blocker for AI adoption in Finnish companies right now?"
- "Are you building with MCP or waiting for the standard to stabilize?"

Questions drive comments. Comments trigger the algorithm to show the post to more
people. First-degree connections who comment make the post visible to their network.

### The "Save this post" line

Add "Save this post for reference" to roundups and how-to posts. LinkedIn's 2026
algorithm weights **saves as the highest-value engagement signal** — higher than
comments, higher than likes.

A post with 50 saves and 10 comments reaches more people than a post with 200 likes
and no saves. Saves indicate the content is reference-quality, which LinkedIn promotes.

Use it sparingly — only on genuinely save-worthy content (checklists, summaries,
how-to posts). Overusing it trains your audience to ignore it.

---

## Finding a job with automated LinkedIn

### Show what you're building weekly with `getRecentCommits`

Recruiters who reach out cold have usually seen evidence of active development. The
`getRecentCommits` tool reads your local git history and composes a LinkedIn post
about what you shipped this week.

Run this every Thursday:

```
Prompt: "Look at my recent commits in /path/to/my-project and write a LinkedIn post
about what I've been building. Keep it high-level and professional."

ChatGPT workflow:
  → getRecentCommits({ repoPath: "/path/to/project", count: 7 })
  → Reviews commit messages
  → Drafts LinkedIn post
  → postUpdate({ text: "..." })
```

This builds a public record of consistent output. A recruiter checking your profile
in week 6 of your job search sees 6 weeks of shipping, not 6 weeks of silence.

**What to include and exclude:**
- Include: feature names, technologies used, problems solved
- Exclude: internal project names, client names, proprietary business logic,
  file paths, database schemas

The `getRecentCommits` handler includes this guidance in its output to ChatGPT:
"Keep it professional and high-level — no internal paths, proprietary details, or
client names."

### Using `searchJobs` strategically

Search for jobs in two passes:

```
# Pass 1: Finnish market
searchJobs({ keyword: "senior backend developer", location: "Helsinki", remote: false })

# Pass 2: Remote roles
searchJobs({ keyword: "TypeScript Node.js", remote: true })
```

After searching, post about the job search itself. A professional post like
"I'm exploring senior backend roles in Helsinki or remote — open to conversations"
signals availability without desperation. LinkedIn's algorithm surfaces your profile
to recruiters when you engage actively, so the search post doubles as a visibility boost.

### Thought leadership positions you before recruiter conversations

Recruiters look at your last 5 posts before reaching out. If your last 5 posts are
thought leadership on TypeScript performance, AI tooling, or distributed systems,
the recruiter has a concrete reason to initiate contact and a specific talking point.

If your last 5 posts are reposts of news articles with no commentary, the recruiter
has nothing to anchor the conversation to.

The Wednesday thought leadership post is particularly important here. Schedule it
consistently so that any recruiter who checks your profile on any given week sees
a recent, substantive post.

### Best times to post when job searching

For Finnish B2B and recruitment audiences:

| Time | Why |
|------|-----|
| Tuesday–Thursday 09:00–11:00 EET | Peak recruiter activity — reviewing profiles before stand-ups |
| Wednesday 16:00 EET | Highest overall Finnish B2B engagement (confirmed by LinkedIn analytics data 2025) |
| Avoid Monday morning | Recruiters are in weekly planning — low profile-browsing activity |
| Avoid Friday afternoon | Decision-makers are winding down — lower organic reach |

The routine endpoints follow this schedule automatically. `postThoughtLeadership`
is designed for Wednesday posting.

---

## LinkedIn algorithm 2026: what matters

Understanding these signals determines whether your posts reach 200 people or 20,000.

### Engagement signal ranking (highest to lowest)

1. **Saves** — Indicates reference-quality content. LinkedIn distributes save-heavy posts
   for days after publishing, not just in the first hour.
2. **Comments** — Especially long comments and replies to comments in thread.
3. **Reposts with commentary** — Original thought added by the sharer.
4. **Reactions** — Likes, celebrates, insightful. Lower signal than the above.

### The first 60 minutes are critical

LinkedIn's algorithm evaluates the velocity of engagement in the first 60 minutes.
A post that receives 20 comments in the first hour will be shown to 10-20x more
second-degree connections than a post that receives 20 comments over a week.

**Action:** When you publish, return to LinkedIn within 10 minutes and reply to every
comment. Your replies count as engagement and extend the first-hour velocity window.

### Native content vs. external links: 3x reach difference

LinkedIn suppresses posts that send users off-platform. A post with an external URL
in the body receives approximately one-third the organic reach of the same post
without a URL.

**Rule:** Never put URLs in the post body. Put them in the first comment.

Exception: `postArticle` with `sourceUrl` uses LinkedIn's native article card format,
which is treated as native content — not as an external link. This is why `postArticle`
exists as a separate tool from `postUpdate`.

For plain text posts where you want to share a link:
1. Post without the URL
2. Immediately comment on your own post with the URL
3. Reply to that comment with "Link in the comment above"

### Posting frequency: quality beats volume

Posting more than once per day triggers LinkedIn's spam filter and reduces the reach
of all posts for 24-48 hours. Three to four quality posts per week consistently
outperforms daily posting of lower-quality content.

LinkedIn's 2026 algorithm also tracks post "dwell time" — how long users spend reading
before scrolling. Long-form thought leadership posts with structured formatting
(short paragraphs, line breaks, numbered lists) score higher dwell time than
dense blocks of text.

---

## Measuring results

### What to track weekly (15 minutes every Monday)

Open LinkedIn Analytics (your profile → Analytics) and record:

| Metric | What it tells you |
|--------|------------------|
| Impressions per post | Which topics and formats reach the most people |
| Post saves | Which content is reference-quality in your niche |
| Profile views | Correlation between posting activity and recruiter/customer interest |
| Follower growth | Weekly net new followers from content |
| Search appearances | Whether your profile shows in keyword searches |

### What to do with the data

**Identify your highest-save post this week.** What was the format? (Numbered list?
Opinion + question? Step-by-step guide?) Replicate that format for next week's post
on the same day.

**Identify the day and time of your best-performing post.** Adjust your routine
schedule if the data suggests a different peak time for your specific audience.

**If profile views spike after a specific post type,** that is your signal that
recruiters or potential customers are responding. Double down on that topic.

### When to switch from Finnish to English

**Stick with Finnish if:**
- Your customers or target employers are primarily Finnish-speaking
- Finnish-language posts consistently outperform English-language posts in your analytics
- You are targeting the Finnish startup/SME market

**Switch to English or mix if:**
- You are targeting international remote roles or customers outside Finland
- You want to reach a broader AI/tech audience beyond the Finnish market

**Practical bilingual approach:**
- Monday AI news: Finnish (reaches Finnish C-suite)
- Wednesday thought leadership: English (reaches international AI community)
- Friday roundup: Finnish (serves Finnish professional audience)

This split lets you build presence in both markets simultaneously without
running two separate content strategies.
