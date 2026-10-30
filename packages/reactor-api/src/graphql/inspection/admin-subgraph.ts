import {
  isCatchUpLevel,
  isMemoryTelemetryOutput,
  type CatchUpPrioritySetting,
  type IInspectorAdmin,
  type MemoryTelemetryChange,
} from "@powerhousedao/reactor";
import { ConsoleLogger } from "document-model";
import { GraphQLError, type DocumentNode } from "graphql";
import { BaseSubgraph } from "../base-subgraph.js";
import { ForbiddenError } from "../errors.js";
import type { Context, SubgraphArgs } from "../types.js";
import { inspectionAdminTypeDefs } from "./admin-schema.js";
import { isListedAdmin } from "./subgraph.js";

type RerunArgs = { processorId: string; clear: boolean; fromOrdinal: number };
type PriorityArgs = { mode: string; level?: number | null };
type MemoryTelemetryArgs = {
  enabled: boolean;
  intervalMs?: number | null;
  outputs?: string[] | null;
};

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** The setting `args` name; throws BAD_USER_INPUT for anything else. */
export function catchUpPrioritySettingOf(
  args: PriorityArgs,
): CatchUpPrioritySetting {
  const level = args.level ?? undefined;
  if (args.mode === "dynamic") {
    if (level !== undefined) {
      throw badInput("A dynamic catch-up priority takes no level");
    }
    return { mode: "dynamic" };
  }
  if (args.mode !== "fixed") {
    throw badInput(
      `Catch-up priority mode must be "fixed" or "dynamic", not ${JSON.stringify(args.mode)}`,
    );
  }
  if (!isCatchUpLevel(level)) {
    throw badInput(
      `A fixed catch-up priority needs a level from 0 to 7, not ${JSON.stringify(level ?? null)}`,
    );
  }
  return { mode: "fixed", level };
}

/** The change `args` name; throws BAD_USER_INPUT for an unknown output. */
export function memoryTelemetryChangeOf(
  args: MemoryTelemetryArgs,
): MemoryTelemetryChange {
  const unknown = args.outputs?.find((o) => !isMemoryTelemetryOutput(o));
  if (unknown !== undefined) {
    throw badInput(`Memory telemetry has no output ${JSON.stringify(unknown)}`);
  }
  return {
    enabled: args.enabled,
    intervalMs: args.intervalMs ?? undefined,
    outputs: args.outputs?.filter(isMemoryTelemetryOutput),
  };
}

function refused(error: unknown): GraphQLError {
  return new GraphQLError(
    error instanceof Error ? error.message : String(error),
    { extensions: { code: "LEVER_REFUSED" } },
  );
}

/** How long a mutation waits on its lever before answering that it started. */
export const LEVER_ANSWER_WINDOW_MS = 2_000;

/**
 * Answers once the lever settles or has run for the window, so a long replay
 * outlives no request; a refusal within it reaches the caller.
 */
async function pulled(
  lever: () => Promise<void>,
  onLateFailure: (error: unknown) => void,
  windowMs: number,
): Promise<boolean> {
  const running = lever();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const window = new Promise<"running">((resolve) => {
    timer = setTimeout(() => resolve("running"), windowMs);
  });
  try {
    if ((await Promise.race([running, window])) === "running") {
      running.catch(onLateFailure);
    }
  } catch (error) {
    throw new GraphQLError(
      error instanceof Error ? error.message : String(error),
      { extensions: { code: "LEVER_REFUSED" } },
    );
  } finally {
    clearTimeout(timer);
  }
  return true;
}

/** Inspection levers for listed admins, kept apart from the read-only inspection subgraph. */
export class InspectionAdminSubgraph extends BaseSubgraph {
  override name = "inspection-admin";
  hasSubscriptions = false;
  override typeDefs: DocumentNode = inspectionAdminTypeDefs;
  override resolvers: Record<string, any>;

  /** Overridable so a test need not wait out the real window. */
  protected answerWindowMs = LEVER_ANSWER_WINDOW_MS;
  private logger = new ConsoleLogger(["InspectionAdminSubgraph"]);

  constructor(args: SubgraphArgs) {
    super(args);
    const admin = args.inspection?.admin;
    if (!admin) {
      throw new Error(
        "InspectionAdminSubgraph requires an inspection source with admin levers; the host did not enable them",
      );
    }
    this.resolvers = this.createResolvers(admin);
  }

  private createResolvers(admin: IInspectorAdmin): Record<string, unknown> {
    const listed =
      <A, R>(run: (args: A) => R) =>
      (_parent: unknown, args: A, ctx: Context): R => {
        if (
          !isListedAdmin(this.authorizationService.config, ctx.user?.address)
        ) {
          throw new ForbiddenError("to pull the reactor's inspection levers");
        }
        return run(args);
      };
    return {
      Query: {
        inspectionAdmin: listed(() => ({
          processors: true,
          catchUpPriority: true,
          memoryTelemetry: true,
        })),
      },
      Mutation: {
        inspectionRetryProcessor: listed(({ processorId }: RerunArgs) =>
          pulled(
            () => admin.retryProcessor(processorId),
            (error) => this.leverFailed("Retry", processorId, error),
            this.answerWindowMs,
          ),
        ),
        inspectionRerunProcessor: listed(
          ({ processorId, clear, fromOrdinal }: RerunArgs) =>
            pulled(
              () => admin.rerunProcessor(processorId, { clear, fromOrdinal }),
              (error) => this.leverFailed("Rerun", processorId, error),
              this.answerWindowMs,
            ),
        ),
        inspectionSetCatchUpPriority: listed(async (args: PriorityArgs) => {
          const setting = catchUpPrioritySettingOf(args);
          try {
            await admin.setCatchUpPriority(setting);
          } catch (error) {
            throw refused(error);
          }
          return true;
        }),
        inspectionSetMemoryTelemetry: listed(
          async (args: MemoryTelemetryArgs) => {
            const change = memoryTelemetryChangeOf(args);
            try {
              await admin.setMemoryTelemetry(change);
            } catch (error) {
              throw refused(error);
            }
            return true;
          },
        ),
        inspectionWriteHeapSnapshot: listed(
          async ({ force }: { force?: boolean | null }) => {
            try {
              return await admin.writeHeapSnapshot(force ?? false);
            } catch (error) {
              throw refused(error);
            }
          },
        ),
      },
    };
  }

  private leverFailed(lever: string, processorId: string, error: unknown) {
    this.logger.error(
      "@Lever of processor '@ProcessorId' failed after it was answered: @Error",
      lever,
      processorId,
      error,
    );
  }
}
