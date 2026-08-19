import { describe, expect, it } from "vitest";
import { upsertForTest } from "./sync.js";

describe("sync markers", () => {
  it("is imported from helper", () => {
    expect(upsertForTest("hello", "<!-- tidyrun:start -->x<!-- tidyrun:end -->")).toContain("tidyrun:start");
  });
});
