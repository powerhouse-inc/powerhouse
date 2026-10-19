// Which workflows depend on a connection, and where. Answers the question a
// connection page has to answer before anyone dares revoke or delete it.

export interface UsageStep {
  id: string;
  key: string;
  name: string;
  pieceName: string;
  pieceVersion: string;
  actionName: string;
  connectionId?: string | null;
  reactorConnectionId?: string | null;
}

export interface UsageTrigger {
  id?: string;
  pieceName?: string;
  pieceVersion?: string;
  triggerName?: string;
  connectionId?: string | null;
  reactorConnectionId?: string | null;
}

export interface UsageWorkflow {
  id: string;
  name: string;
  status: string;
  trigger?: UsageTrigger | null;
  steps: readonly UsageStep[];
}

export interface ConnectionUsage {
  workflow: UsageWorkflow;
  // The trigger binds this connection, as its connection or reactor connection.
  trigger: boolean;
  steps: UsageStep[];
  // The subset bound as a reactor connection.
  reactorTrigger: boolean;
  reactorSteps: UsageStep[];
}

function binds(
  block: { connectionId?: string | null; reactorConnectionId?: string | null },
  connectionId: string,
): boolean {
  return (
    block.connectionId === connectionId ||
    block.reactorConnectionId === connectionId
  );
}

export function connectionUsage(
  connectionId: string,
  workflows: readonly UsageWorkflow[],
): ConnectionUsage[] {
  const usage: ConnectionUsage[] = [];
  for (const workflow of workflows) {
    const trigger = Boolean(
      workflow.trigger && binds(workflow.trigger, connectionId),
    );
    const steps = workflow.steps.filter((step) => binds(step, connectionId));
    if (!trigger && steps.length === 0) continue;
    usage.push({
      workflow,
      trigger,
      steps,
      reactorTrigger: workflow.trigger?.reactorConnectionId === connectionId,
      reactorSteps: steps.filter(
        (step) => step.reactorConnectionId === connectionId,
      ),
    });
  }
  return usage.sort((a, b) => a.workflow.name.localeCompare(b.workflow.name));
}

// An enabled workflow that depends on this connection breaks the moment it is
// revoked, so the UI warns before that happens.
export function enabledDependents(usage: ConnectionUsage[]): number {
  return usage.filter((entry) => entry.workflow.status === "ENABLED").length;
}
