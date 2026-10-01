// Samples `docker stats` for the stack's containers in the background and
// summarizes CPU and memory per container over a window.
import { run } from "./sh.js";

export interface Sample {
  at: number;
  container: string;
  cpu: number;
  memMb: number;
}

export interface ContainerUsage {
  avgCpu: number;
  maxCpu: number;
  /** CPU-seconds used over the window, from the average percentage */
  cpuSeconds: number;
  maxMemMb: number;
}

function memMb(usage: string): number {
  const value = parseFloat(usage);
  if (usage.includes("GiB")) return value * 1024;
  if (usage.includes("KiB")) return value / 1024;
  return value;
}

export class StatsSampler {
  samples: Sample[] = [];
  #running = false;
  #loop: Promise<void> | undefined;

  constructor(private filter = "registry-e2e") {}

  start(): void {
    this.#running = true;
    this.#loop = (async () => {
      while (this.#running) {
        const res = await run(
          "docker",
          [
            "stats",
            "--no-stream",
            "--format",
            "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}",
          ],
          { allowFailure: true },
        );
        const at = Date.now();
        for (const line of res.stdout.split("\n")) {
          const [container, cpu, mem] = line.split("\t");
          if (!container?.includes(this.filter) || !cpu) continue;
          this.samples.push({
            at,
            container,
            cpu: parseFloat(cpu),
            memMb: memMb(mem.split("/")[0].trim()),
          });
        }
      }
    })();
  }

  async stop(): Promise<void> {
    this.#running = false;
    await this.#loop;
  }

  /** Usage per container between two timestamps. */
  usage(from: number, to: number): Record<string, ContainerUsage> {
    const out: Record<string, ContainerUsage> = {};
    const window = this.samples.filter((s) => s.at >= from && s.at <= to);
    const seconds = (to - from) / 1000;
    for (const container of new Set(window.map((s) => s.container))) {
      const own = window.filter((s) => s.container === container);
      const avg = own.reduce((sum, s) => sum + s.cpu, 0) / own.length;
      out[container] = {
        avgCpu: Math.round(avg * 10) / 10,
        maxCpu: Math.round(Math.max(...own.map((s) => s.cpu)) * 10) / 10,
        cpuSeconds: Math.round((avg / 100) * seconds * 10) / 10,
        maxMemMb: Math.round(Math.max(...own.map((s) => s.memMb))),
      };
    }
    return out;
  }
}
