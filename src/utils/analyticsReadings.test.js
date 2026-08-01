import { describe, expect, it } from "vitest";
import { countMinuteReadings } from "./analyticsReadings";

describe("countMinuteReadings", () => {
  it("counts repeated raw samples from one device and session once per minute", () => {
    expect(countMinuteReadings([
      { minerId: "SCM-001", timestamp: 1710000000000, sessionId: "SCM-001-1000" },
      { minerId: "SCM-001", timestamp: 1710000030000, sessionId: "SCM-001-1000" },
      { minerId: "SCM-001", timestamp: 1710000059000, sessionId: "SCM-001-1000" },
    ])).toBe(1);
  });

  it("counts a restarted session separately even when it starts in the same minute", () => {
    expect(countMinuteReadings([
      { minerId: "SCM-001", timestamp: 1710000000000, sessionId: "SCM-001-1000" },
      { minerId: "SCM-001", timestamp: 1710000030000, sessionId: "SCM-001-2000" },
    ])).toBe(2);
  });

  it("keeps devices separate when they report in the same minute", () => {
    expect(countMinuteReadings([
      { minerId: "SCM-001", timestamp: 1710000000000 },
      { minerId: "SCM-002", timestamp: 1710000005000 },
    ])).toBe(2);
  });
});
