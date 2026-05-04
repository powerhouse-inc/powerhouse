// test suite for the switchboard hooks

import {
  buildDocumentSubgraphUrl,
  getSwitchboardGatewayUrlFromDriveUrl,
} from "@powerhousedao/reactor-browser";
import { describe, it } from "vitest";

describe("Switchboard hooks", () => {
  it("should return the proper switchboard url", () => {
    const url = getSwitchboardGatewayUrlFromDriveUrl(
      "https://example.com/d/123",
    );
    expect(url).toBe("https://example.com/graphql");
  });

  it("should return the proper switchboard link", () => {
    const url = buildDocumentSubgraphUrl(
      "https://example.com/d/123",
      "test-document",
    );
    expect(url).toBe(
      "https://example.com/d/123?explorerURLState=N4IgJg9gxgrgtgUwHYBcQC4QEcYIE4CeABAOIIoAi08yKA6gJYoAWA8gA74CGKDESAZwAUAHSREJRACQMwtBgDMG+dEQDKKPAyQBzAIRjJ0gG7KA7qoBq5gGIMANinwBJJOxgpDkqRE54efIJ2jipEVLCIqBzcvPwCwU54ru6e4t6+MYECAApcOto6qrn5uskeXgCURMBeEpARtEKy8kqhMnKoisp4ADREpggWJuZVNWlG9TSo1bVGRAB0i9kAEuFTKHYI9mACs0YZ-rGCQkoheKo+fgFxCfh97HkFFwfXgsUFo3tzTAhwAjPjOZGbRyAAeXyBvEQAhQXDg7AAqigoABZXaAoESZhcATMCFzAQAawY7HxRnweAgeDJklkNIkXCgRwBmMxdIxrKIKAInHpkihCBhcMRyLRfIk2hS4qIAigGWlPFhUGYkRQ-zGnMxYB4XGlEjgDEQABUeQg9URsbjzQhQU5BIFzacEAA5OFmjmsgC+0rlqBtKBZmoJDB0SHwgaDcxgAnDGsjmK4YDAeEF6PjmLDKDMVMJzjA5qMyq42jzBaI3o9Qa47HYEfTkiQbrLEkJCAIZYr9ckAhDjZQMBTafrnfjI81Y8xE8hEFh9gAwhAYKgaZbnf7iu7NZbsinTIucnlN5zYHgBFT8VPy19lQ4wHmhxIRyOvAp-DpVUQVmtVZttv9+J+qzUB+cYSvmgICPYMA6LMjaILMkyqiavIQbCTizLuDA9nEAAyWEBqB3ZyihQKYdhSCzBOUApjwCBgAAgigSJQM4Z6zPYOIoCiEBgF0dGMcxrEQF4nogD0IDGFwWhcAARvYgoYCAcYiCAzSdK01IYEQKlODCAC0iG0CpPReCpyYMMYCCllpKkAIwAEwAMwqWIomekAA",
    );
  });
});
