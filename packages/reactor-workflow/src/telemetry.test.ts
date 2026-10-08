import { metrics } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import { WorkflowTelemetry } from "./telemetry.js";

describe("WorkflowTelemetry", () => {
  it("creates the dispatcher's gauges once, however often a runtime observes", () => {
    const meter = metrics.getMeter("telemetry-test");
    const create = vi.spyOn(meter, "createObservableGauge");
    const telemetry = new WorkflowTelemetry({ meter });
    const stats = () => ({ inFlight: 0, waiting: 0, utilization: 0 });

    telemetry.observeDispatcher(stats)();
    telemetry.observeDispatcher(stats)();

    expect(create).toHaveBeenCalledTimes(3);
  });
});
