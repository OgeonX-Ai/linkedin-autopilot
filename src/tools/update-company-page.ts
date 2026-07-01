/**
 * Update the OgeonX AI LinkedIn company page profile via API.
 * Sets description (EN + FI), tagline (EN + FI), specialties, and website URL.
 * Requires rw_organization_admin scope.
 */

import { LinkedInClient, LinkedInApiError } from "../linkedin/client.js";
import { config } from "../config.js";

const EN_DESCRIPTION = `OgeonX AI automates your LinkedIn presence so you don't have to think about it.

Connect ChatGPT or Claude to your LinkedIn account via our MCP (Model Context Protocol) server. From that point on, your LinkedIn runs itself:

→ Daily AI news posts — fresh headlines, every morning
→ Mid-week thought leadership — opinion posts that drive comments and reach
→ Friday roundups — curated summaries people save and return to
→ Long-form articles — give us a title and body, we handle the rest
→ Company page posting — everything works for your business brand too

Built for founders, executives, and teams who know LinkedIn drives pipeline but can't make time for daily content creation.

What makes OgeonX different:
• Runs on your own LinkedIn credentials — no black-box SaaS
• Self-hosted — your tokens never leave your server
• Open source — inspect, fork, run it yourself
• MCP-native — works with ChatGPT and Claude out of the box

Built in Finland 🇫🇮 by Kim Harjamäki`;

const FI_DESCRIPTION = `OgeonX AI automatisoi LinkedIn-läsnäolosi, jotta sinun ei tarvitse miettiä sitä päivittäin.

Yhdistä ChatGPT tai Claude LinkedIn-tiliisi MCP-palvelimemme (Model Context Protocol) kautta. Sen jälkeen LinkedIn pyörii itsekseen:

→ Päivittäiset tekoälyuutiset — tuoreet otsikot joka aamu
→ Asiantuntijapostaukset viikon puolivälissä — mielipidekirjoituksia, jotka herättävät keskustelua
→ Viikkokatsaukset perjantaisin — koosteet, joita ihmiset tallentavat
→ Pitkät artikkelit — anna otsikko ja sisältö, me hoidamme loput
→ Yrityssivun postaukset — kaikki toimii myös yritysbrändillesi

Rakennettu yrittäjille ja johtajille, jotka tietävät LinkedIn-näkyvyyden tuovan liidejä — mutta joilla ei ole aikaa päivittäiseen sisällöntuotantoon.

Mikä tekee OgeonX AI:sta erilaisen:
• Toimii omilla LinkedIn-tunnuksillasi — ei mustia laatikoita välissä
• Oma palvelin — tokenisi eivät koskaan poistu palvelimeltasi
• Avoimen lähdekoodin ratkaisu
• MCP-natiivi — toimii ChatGPT:n ja Clauden kanssa suoraan

Rakennettu Suomessa 🇫🇮 Kim Harjamäen toimesta`;

const EN_TAGLINE = `Your LinkedIn presence, on autopilot.`;
const FI_TAGLINE = `LinkedIn-läsnäolosi automaattisesti – tekoälyn voimin.`;

const SPECIALTIES = [
  "AI Automation",
  "LinkedIn Automation",
  "MCP Servers",
  "Marketing Automation",
  "Developer Tools",
  "Content Automation",
  "ChatGPT Integration",
];

const WEBSITE_URL = "https://github.com/OgeonX-Ai";

export async function updateCompanyPageHandler(
  session: { accessToken?: string },
): Promise<{ isError: boolean; content: Array<{ type: "text"; text: string }> }> {
  if (!session.accessToken) {
    return {
      isError: true,
      content: [{ type: "text", text: "Not authenticated. Visit /auth/login to connect LinkedIn." }],
    };
  }

  const orgId = config.linkedinOrgId;
  if (!orgId) {
    return {
      isError: true,
      content: [{ type: "text", text: "LINKEDIN_ORG_ID not set in environment." }],
    };
  }

  const client = new LinkedInClient();
  const results: string[] = [];
  const errors: string[] = [];

  // Update description (EN + FI)
  try {
    await client.updateOrganization(session.accessToken, orgId, {
      description: {
        localized: {
          en_US: EN_DESCRIPTION,
          fi_FI: FI_DESCRIPTION,
        },
        preferredLocale: { country: "US", language: "en" },
      },
    });
    results.push("✅ Description (EN + FI)");
  } catch (err) {
    errors.push(`❌ Description: ${err instanceof LinkedInApiError ? err.message : "unknown error"}`);
  }

  // Update tagline (EN + FI)
  try {
    await client.updateOrganization(session.accessToken, orgId, {
      tagline: {
        localized: {
          en_US: EN_TAGLINE,
          fi_FI: FI_TAGLINE,
        },
        preferredLocale: { country: "US", language: "en" },
      },
    });
    results.push("✅ Tagline (EN + FI)");
  } catch (err) {
    errors.push(`❌ Tagline: ${err instanceof LinkedInApiError ? err.message : "unknown error"}`);
  }

  // Update specialties
  try {
    await client.updateOrganization(session.accessToken, orgId, {
      specialties: SPECIALTIES,
    });
    results.push("✅ Specialties");
  } catch (err) {
    errors.push(`❌ Specialties: ${err instanceof LinkedInApiError ? err.message : "unknown error"}`);
  }

  // Update website URL
  try {
    await client.updateOrganization(session.accessToken, orgId, {
      websiteUrl: WEBSITE_URL,
    });
    results.push("✅ Website URL");
  } catch (err) {
    errors.push(`❌ Website: ${err instanceof LinkedInApiError ? err.message : "unknown error"}`);
  }

  const summary = [
    `OgeonX AI company page update complete.`,
    ``,
    ...results,
    ...(errors.length > 0 ? [``, `Issues:`, ...errors] : []),
    ``,
    errors.some(e => e.includes("Permission denied"))
      ? `⚠️  Permission denied on some fields — add rw_organization_admin scope to your LinkedIn app, re-auth at /auth/login, then run again.`
      : `View your page: https://www.linkedin.com/company/${orgId}/`,
  ].join("\n");

  return {
    isError: errors.length === results.length + errors.length,
    content: [{ type: "text", text: summary }],
  };
}
