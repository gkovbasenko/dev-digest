import { describe, it, expect } from "vitest";
import { liveColumnStatus } from "./helpers";

describe("liveColumnStatus (AC-24/30)", () => {
  it("a done/failed base status is returned as-is, ignoring any events", () => {
    expect(liveColumnStatus({ run_id: "r1", status: "done" }, [{ runId: "r1", kind: "error" }])).toBe(
      "done",
    );
    expect(liveColumnStatus({ run_id: "r1", status: "failed" }, [])).toBe("failed");
  });

  it("a running column flips to 'done' the moment its stream emits a 'result' event for its run_id", () => {
    const events = [
      { runId: "other", kind: "info" },
      { runId: "r1", kind: "info" },
      { runId: "r1", kind: "result" },
    ];
    expect(liveColumnStatus({ run_id: "r1", status: "running" }, events)).toBe("done");
  });

  it("a running column flips to 'failed' on an 'error' event scoped to its own run_id", () => {
    const events = [{ runId: "r2", kind: "error" }];
    expect(liveColumnStatus({ run_id: "r1", status: "running" }, events)).toBe("running");
    expect(liveColumnStatus({ run_id: "r2", status: "running" }, events)).toBe("failed");
  });

  it("stays 'running' with no terminal event yet", () => {
    expect(liveColumnStatus({ run_id: "r1", status: "running" }, [{ runId: "r1", kind: "tool" }])).toBe(
      "running",
    );
  });
});
