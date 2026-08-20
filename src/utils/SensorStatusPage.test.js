import { describe, expect, it } from "vitest";
import { manualAssessmentSummary, manualValueStatus } from "../pages/SensorStatusPage";

describe("manual sensor health controls", () => {
  it("keeps an untouched bar separate from a critical zero", () => {
    expect(manualValueStatus(0, false)).toMatchObject({ label: "Not reviewed" });
    expect(manualValueStatus(0, true)).toMatchObject({ label: "Critical", helper: "Needs action" });
  });

  it("summarizes partial operator input as in progress", () => {
    const summary = manualAssessmentSummary({
      connection: { value: 80, reviewed: true },
      freshness: { value: 65, reviewed: true },
    });

    expect(summary).toMatchObject({ reviewed: 2, display: "2/6 set" });
  });

  it("shows the average status after every component is reviewed", () => {
    const assessment = {
      connection: { value: 100, reviewed: true },
      freshness: { value: 90, reviewed: true },
      contact: { value: 80, reviewed: true },
      heartRate: { value: 75, reviewed: true },
      spo2: { value: 95, reviewed: true },
      temperature: { value: 60, reviewed: true },
    };

    expect(manualAssessmentSummary(assessment)).toMatchObject({ reviewed: 6, display: "83% · Good" });
  });
});
