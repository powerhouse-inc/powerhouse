import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeterProviderFromEnv } from "../src/metrics.js";

// Stub childLogger so tests don't require the full document-drive runtime
vi.mock("document-drive", () => ({
  childLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function getReader(provider: MeterProvider): PeriodicExportingMetricReader {
  const state = (
    provider as unknown as {
      _sharedState: {
        metricCollectors: Array<{
          _metricReader: PeriodicExportingMetricReader;
        }>;
      };
    }
  )._sharedState;
  return state.metricCollectors[0]._metricReader;
}

function getResourceAttributes(
  provider: MeterProvider,
): Record<string, unknown> {
  const state = (
    provider as unknown as {
      _sharedState: { resource: { attributes: Record<string, unknown> } };
    }
  )._sharedState;
  return state.resource.attributes;
}

describe("createMeterProviderFromEnv", () => {
  describe("when OTEL_EXPORTER_OTLP_ENDPOINT is not set", () => {
    it("returns undefined", () => {
      expect(createMeterProviderFromEnv({})).toBeUndefined();
    });
  });

  describe("when OTEL_EXPORTER_OTLP_ENDPOINT is set", () => {
    it("returns a MeterProvider", () => {
      const provider = createMeterProviderFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      });
      expect(provider).toBeInstanceOf(MeterProvider);
      void provider?.shutdown();
    });

    it("strips trailing slash from endpoint URL without throwing", () => {
      expect(() =>
        createMeterProviderFromEnv({
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318/",
        }),
      ).not.toThrow();
    });

    it("uses 5000ms export interval by default", () => {
      const provider = createMeterProviderFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      }) as MeterProvider;

      expect(getReader(provider)._exportInterval).toBe(5000);
      void provider.shutdown();
    });

    it("honours OTEL_METRIC_EXPORT_INTERVAL", () => {
      const provider = createMeterProviderFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_METRIC_EXPORT_INTERVAL: "2000",
      }) as MeterProvider;

      expect(getReader(provider)._exportInterval).toBe(2000);
      void provider.shutdown();
    });

    it("falls back to 5000ms when OTEL_METRIC_EXPORT_INTERVAL is non-numeric", () => {
      const provider = createMeterProviderFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_METRIC_EXPORT_INTERVAL: "abc",
      }) as MeterProvider;

      expect(getReader(provider)._exportInterval).toBe(5000);
      void provider.shutdown();
    });

    it("falls back to 5000ms when OTEL_METRIC_EXPORT_INTERVAL is zero", () => {
      const provider = createMeterProviderFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_METRIC_EXPORT_INTERVAL: "0",
      }) as MeterProvider;

      expect(getReader(provider)._exportInterval).toBe(5000);
      void provider.shutdown();
    });

    it("falls back to 5000ms when OTEL_METRIC_EXPORT_INTERVAL is negative", () => {
      const provider = createMeterProviderFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_METRIC_EXPORT_INTERVAL: "-1000",
      }) as MeterProvider;

      expect(getReader(provider)._exportInterval).toBe(5000);
      void provider.shutdown();
    });

    it("sets exportTimeoutMillis below exportIntervalMillis", () => {
      const provider = createMeterProviderFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_METRIC_EXPORT_INTERVAL: "1000",
      }) as MeterProvider;

      const reader = getReader(provider);
      expect(reader._exportTimeout).toBeLessThan(reader._exportInterval);
      void provider.shutdown();
    });

    it("uses 'switchboard' as service name by default", () => {
      const provider = createMeterProviderFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      }) as MeterProvider;

      expect(getResourceAttributes(provider)["service.name"]).toBe(
        "switchboard",
      );
      void provider.shutdown();
    });

    it("honours OTEL_SERVICE_NAME", () => {
      const provider = createMeterProviderFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_SERVICE_NAME: "my-switchboard",
      }) as MeterProvider;

      expect(getResourceAttributes(provider)["service.name"]).toBe(
        "my-switchboard",
      );
      void provider.shutdown();
    });
  });
});
