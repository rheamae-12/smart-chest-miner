import { describe, expect, it } from "vitest";
import { sortMinersActiveFirst } from "./minerOrdering";

describe("sortMinersActiveFirst", () => {
  it("puts reporting miners first and keeps each status group ordered by device ID", () => {
    const miners = [
      { id: "SCM-003", active: false },
      { id: "SCM-002", active: true },
      { id: "SCM-001", active: true },
      { id: "SCM-004", active: true, stale: true },
    ];

    expect(sortMinersActiveFirst(miners).map((miner) => miner.id)).toEqual([
      "SCM-001",
      "SCM-002",
      "SCM-003",
      "SCM-004",
    ]);
  });
});
