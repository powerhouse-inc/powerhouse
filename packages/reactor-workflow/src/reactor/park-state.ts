import type { WorkflowParkRow } from "./store.js";

// Each park as the trigger lane leaves it once its queued tasks have run.
export class ParkState {
  private readonly parks = new Map<string, WorkflowParkRow>();
  // Written before the seed landed: the seed must not overwrite these.
  private readonly written = new Set<string>();
  private seeded = false;
  private seeding?: Promise<void>;

  constructor(
    private readonly load: () => Promise<
      readonly WorkflowParkRow[] | undefined
    >,
  ) {}

  async get(workflowId: string): Promise<WorkflowParkRow | undefined> {
    if (!this.seeded) {
      this.seeding ??= this.seed().finally(() => {
        this.seeding = undefined;
      });
      await this.seeding;
    }
    return this.parks.get(workflowId);
  }

  // Undefined while the seed has not covered this workflow.
  known(workflowId: string): { park?: WorkflowParkRow } | undefined {
    if (!this.seeded && !this.written.has(workflowId)) return undefined;
    return { park: this.parks.get(workflowId) };
  }

  set(park: WorkflowParkRow): void {
    this.parks.set(park.workflow_id, park);
    if (!this.seeded) this.written.add(park.workflow_id);
  }

  delete(workflowId: string): void {
    this.parks.delete(workflowId);
    if (!this.seeded) this.written.add(workflowId);
  }

  private async seed(): Promise<void> {
    const rows = await this.load();
    if (!rows) return;
    for (const row of rows) {
      if (!this.written.has(row.workflow_id)) {
        this.parks.set(row.workflow_id, row);
      }
    }
    this.written.clear();
    this.seeded = true;
  }
}
