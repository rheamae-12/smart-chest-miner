import { describe, expect, it } from "vitest";
import { sortMinersActiveFirst } from "./minerOrdering";

describe("sortMinersActiveFirst", () => {
  it("puts reporting miners first and keeps each status group ordered by device ID", () => {
    const miners = [
      { id: "MCM-003", active: false },
      { id: "MCM-002", active: true },
      { id: "MCM-001", active: true },
      { id: "MCM-004", active: true, stale: true },
    ];

    expect(sortMinersActiveFirst(miners).map((miner) => miner.id)).toEqual([
      "MCM-001",
      "MCM-002",
      "MCM-003",
      "MCM-004",
    ]);
  });
});
