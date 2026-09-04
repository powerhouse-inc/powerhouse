// Which workflows depend on a connection, and where. Answers the question a
// connection page has to answer before anyone dares revoke or delete it.

export interface UsageStep {
  id: string;
  key: string;
  name: string;
  blockType: string;
}

export interface UsageWorkflow {
  id: string;
  name: string;
  status: string;
  trigger?: { blockType: string; connectionId?: string | null } | null;
  steps: readonly UsageStep[];
}

export interface ConnectionUsage {
  workflow: UsageWorkflow;
  // The trigger binds this connection.
  trigger: boolean;
  steps: UsageStep[];
}

export function connectionUsage(
  connectionId: string,
  workflows: readonly UsageWorkflow[],
): ConnectionUsage[] {
  const usage: ConnectionUsage[] = [];
  for (const workflow of workflows) {
    const trigger = workflow.trigger?.connectionId === connectionId;
    const steps = workflow.steps.filter(
      (step) =>
        (step as { connectionId?: string | null }).connectionId ===
        connectionId,
    );
    if (trigger || steps.length > 0) usage.push({ workflow, trigger, steps });
  }
  return usage.sort((a, b) => a.workflow.name.localeCompare(b.workflow.name));
}

// An enabled workflow that depends on this connection breaks the moment it is
// revoked, so the UI warns before that happens.
export function enabledDependents(usage: ConnectionUsage[]): number {
  return usage.filter((entry) => entry.workflow.status === "ENABLED").length;
}
