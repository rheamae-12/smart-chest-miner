import { describe, expect, it } from "vitest";
import { mergeSensorSeries } from "./sensorSeries";

describe("mergeSensorSeries", () => {
  it("aligns sensor readings by timestamp instead of array position", () => {
    const rows = mergeSensorSeries({
      hr: [
        { timestamp: 1000, time: "A", hr: 80 },
        { timestamp: 3000, time: "C", hr: 82 },
      ],
      spo2: [
        { timestamp: 1000, time: "A", spo2: 98 },
        { timestamp: 2000, time: "B", spo2: 97 },
        { timestamp: 3000, time: "C", spo2: 96 },
      ],
      temp: [{ timestamp: 3000, time: "C", temp: 36.8 }],
    });

    expect(rows).toEqual([
      { timestamp: 1000, time: "A", hr: 80, spo2: 98, temp: null },
      { timestamp: 2000, time: "B", hr: null, spo2: 97, temp: null },
      { timestamp: 3000, time: "C", hr: 82, spo2: 96, temp: 36.8 },
    ]);
  });

  it("sorts rows chronologically and enforces the requested limit", () => {
    const rows = mergeSensorSeries({
      hr: [
        { timestamp: 3000, time: "C", hr: 83 },
        { timestamp: 1000, time: "A", hr: 81 },
        { timestamp: 2000, time: "B", hr: 82 },
      ],
    }, 2);

    expect(rows.map((row) => row.timestamp)).toEqual([2000, 3000]);
  });
});
