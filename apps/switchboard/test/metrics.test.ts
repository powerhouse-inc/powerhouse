import { MeterProvider } from "@opentelemetry/sdk-metrics";
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

const providers: MeterProvider[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  // Await shutdown so PeriodicExportingMetricReader timers are cleared
  await Promise.all(providers.map((p) => p.shutdown()));
  providers.length = 0;
});

function track(provider: MeterProvider | undefined): MeterProvider | undefined {
  if (provider) providers.push(provider);
  return provider;
}

function trackAsserted(provider: MeterProvider | undefined): MeterProvider {
  expect(provider).toBeInstanceOf(MeterProvider);
  return track(provider) as MeterProvider;
}

// These helpers access undocumented internal fields of MeterProvider and
// PeriodicExportingMetricReader. They may break if @opentelemetry/sdk-metrics
// renames its private state between major versions.
function getReader(provider: MeterProvider): {
  _exportInterval: number;
  _exportTimeout: number;
} {
  return (
    provider as unknown as {
      _sharedState: {
        metricCollectors: Array<{
          _metricReader: { _exportInterval: number; _exportTimeout: number };
        }>;
      };
    }
  )._sharedState.metricCollectors[0]._metricReader;
}

function getExporterUrl(provider: MeterProvider): string {
  return (
    provider as unknown as {
      _sharedState: {
        metricCollectors: Array<{
          _metricReader: {
            _exporter: {
              _delegate: {
                _transport: {
                  _transport: { _parameters: { url: string } };
                };
              };
            };
          };
        }>;
      };
    }
  )._sharedState.metricCollectors[0]._metricReader._exporter._delegate
    ._transport._transport._parameters.url;
}

function getResourceAttributes(
  provider: MeterProvider,
): Record<string, unknown> {
  return (
    provider as unknown as {
      _sharedState: { resource: { attributes: Record<string, unknown> } };
    }
  )._sharedState.resource.attributes;
}

describe("createMeterProviderFromEnv", () => {
  describe("when OTEL_EXPORTER_OTLP_ENDPOINT is not set", () => {
    it("returns undefined", () => {
      expect(createMeterProviderFromEnv({})).toBeUndefined();
    });
  });

  describe("when OTEL_EXPORTER_OTLP_ENDPOINT is set", () => {
    it("returns a MeterProvider", () => {
      expect(
        track(
          createMeterProviderFromEnv({
            OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
          }),
        ),
      ).toBeInstanceOf(MeterProvider);
    });

    it("strips trailing slash from endpoint URL without throwing", () => {
      expect(() =>
        track(
          createMeterProviderFromEnv({
            OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318/",
          }),
        ),
      ).not.toThrow();
    });

    it("does not double-append /v1/metrics when endpoint already includes it", () => {
      const provider = trackAsserted(
        createMeterProviderFromEnv({
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318/v1/metrics",
        }),
      );
      expect(getExporterUrl(provider)).toBe("http://localhost:4318/v1/metrics");
    });

    it("uses 5000ms export interval by default", () => {
      const provider = trackAsserted(
        createMeterProviderFromEnv({
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        }),
      );
      expect(getReader(provider)._exportInterval).toBe(5000);
    });

    it("honours OTEL_METRIC_EXPORT_INTERVAL", () => {
      const provider = trackAsserted(
        createMeterProviderFromEnv({
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
          OTEL_METRIC_EXPORT_INTERVAL: "2000",
        }),
      );
      expect(getReader(provider)._exportInterval).toBe(2000);
    });

    it("falls back to 5000ms when OTEL_METRIC_EXPORT_INTERVAL is non-numeric", () => {
      const provider = trackAsserted(
        createMeterProviderFromEnv({
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
          OTEL_METRIC_EXPORT_INTERVAL: "abc",
        }),
      );
      expect(getReader(provider)._exportInterval).toBe(5000);
    });

    it("falls back to 5000ms when OTEL_METRIC_EXPORT_INTERVAL is zero", () => {
      const provider = trackAsserted(
        createMeterProviderFromEnv({
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
          OTEL_METRIC_EXPORT_INTERVAL: "0",
        }),
      );
      expect(getReader(provider)._exportInterval).toBe(5000);
    });

    it("falls back to 5000ms when OTEL_METRIC_EXPORT_INTERVAL is negative", () => {
      const provider = trackAsserted(
        createMeterProviderFromEnv({
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
          OTEL_METRIC_EXPORT_INTERVAL: "-1000",
        }),
      );
      expect(getReader(provider)._exportInterval).toBe(5000);
    });

    it("sets exportTimeoutMillis below exportIntervalMillis", () => {
      const provider = trackAsserted(
        createMeterProviderFromEnv({
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
          OTEL_METRIC_EXPORT_INTERVAL: "1000",
        }),
      );
      const reader = getReader(provider);
      expect(reader._exportTimeout).toBeLessThan(reader._exportInterval);
    });

    it("uses 'switchboard' as service name by default", () => {
      const provider = trackAsserted(
        createMeterProviderFromEnv({
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        }),
      );
      expect(getResourceAttributes(provider)["service.name"]).toBe(
        "switchboard",
      );
    });

    it("honours OTEL_SERVICE_NAME", () => {
      const provider = trackAsserted(
        createMeterProviderFromEnv({
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
          OTEL_SERVICE_NAME: "my-switchboard",
        }),
      );
      expect(getResourceAttributes(provider)["service.name"]).toBe(
        "my-switchboard",
      );
    });
  });
});
