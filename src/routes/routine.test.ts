import { describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: {
    apiKeys: [],
    linkedinOrgId: "135254511",
  },
}));

import { toPublishingSession } from "./routine.js";

describe("scheduled company publishing", () => {
  it("routes scheduled posts to the configured organization", () => {
    expect(
      toPublishingSession({
        accessToken: "access-token",
        linkedinSub: "member-id",
      }),
    ).toEqual({
      accessToken: "access-token",
      linkedinSub: "member-id",
      orgId: "135254511",
    });
  });
});
