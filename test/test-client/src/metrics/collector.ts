import type {
  DocumentResult,
  OperationResult,
  Statistics,
} from "../types.js";

export class MetricsCollector {
  private operationResults: OperationResult[] = [];
  private documentResults: DocumentResult[] = [];
  private startTime: number = Date.now();
  private errors: Map<string, number> = new Map();

  reset(): void {
    this.operationResults = [];
    this.documentResults = [];
    this.startTime = Date.now();
    this.errors.clear();
  }

  setStartTime(time: number): void {
    this.startTime = time;
  }

  recordOperation(result: OperationResult): void {
    this.operationResults.push(result);
    if (!result.success && result.error) {
      const count = this.errors.get(result.error) || 0;
      this.errors.set(result.error, count + 1);
    }
  }

  recordDocumentCreation(result: DocumentResult): void {
    this.documentResults.push(result);
    if (!result.success && result.error) {
      const count = this.errors.get(result.error) || 0;
      this.errors.set(result.error, count + 1);
    }
  }

  getStatistics(): Statistics {
    const now = Date.now();
    const durationSeconds = (now - this.startTime) / 1000;

    const totalOps = this.operationResults.reduce(
      (sum, r) => sum + r.operationCount,
      0,
    );
    const successfulOps = this.operationResults
      .filter((r) => r.success)
      .reduce((sum, r) => sum + r.operationCount, 0);
    const failedOps = totalOps - successfulOps;

    const latencies = this.operationResults.map((r) => r.latencyMs).sort((a, b) => a - b);

    return {
      totalOperations: totalOps,
      successfulOperations: successfulOps,
      failedOperations: failedOps,
      documentsCreated: this.documentResults.filter((r) => r.success).length,
      latency: this.calculateLatencyStats(latencies),
      throughput: {
        opsPerSecond: durationSeconds > 0 ? successfulOps / durationSeconds : 0,
        docsPerMinute:
          durationSeconds > 0
            ? (this.documentResults.filter((r) => r.success).length /
                durationSeconds) *
              60
            : 0,
      },
      errors: this.errors,
    };
  }

  private calculateLatencyStats(latencies: number[]): Statistics["latency"] {
    if (latencies.length === 0) {
      return { min: 0, max: 0, avg: 0, p95: 0, p99: 0 };
    }

    const sum = latencies.reduce((a, b) => a + b, 0);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    return {
      min: latencies[0],
      max: latencies[latencies.length - 1],
      avg: Math.round(sum / latencies.length),
      p95: latencies[p95Index] || latencies[latencies.length - 1],
      p99: latencies[p99Index] || latencies[latencies.length - 1],
    };
  }

  getCurrentProgress(): {
    totalOps: number;
    errors: number;
    avgLatency: number;
  } {
    const totalOps = this.operationResults.reduce(
      (sum, r) => sum + r.operationCount,
      0,
    );
    const errors = this.operationResults.filter((r) => !r.success).length;
    const latencies = this.operationResults.map((r) => r.latencyMs);
    const avgLatency =
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;

    return { totalOps, errors, avgLatency };
  }
}
