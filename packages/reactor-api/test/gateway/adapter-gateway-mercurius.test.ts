import { vi } from "vitest";
import { MercuriusGatewayAdapter } from "../../src/graphql/gateway/adapter-gateway-mercurius.js";
import {
  runGatewayAdapterContractTests,
  type GatewayAdapterHarness,
} from "./gateway-adapter-contract.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

const silentLogger = {
  level: "error" as const,
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  errorHandler: vi.fn(),
  child: () => silentLogger,
};

// ─── run the shared contract suite against MercuriusGatewayAdapter ───────────

runGatewayAdapterContractTests(
  "MercuriusGatewayAdapter",
  async (): Promise<GatewayAdapterHarness> => {
    const adapter = new MercuriusGatewayAdapter(silentLogger);
    return {
      adapter,
      close: () => adapter.stop(),
    };
  },
);
