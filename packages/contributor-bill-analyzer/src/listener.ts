import {
  InternalTransmitterUpdate,
  Listener,
  OperationUpdate,
} from "document-drive";
import { and, eq } from "drizzle-orm";
import { PgDatabase } from "drizzle-orm/pg-core";
import { contributorBillAnalyzer } from "./schema";

interface AddCompensationInput {
  projectCode: string;
  amount: number;
  token: string;
  updatedAt: Date;
}

interface RemoveCompensationInput {
  projectCode: string;
  token: string;
  amount: number;
}

export const options: Omit<Listener, "driveId"> = {
  listenerId: "contributor-bill-analyzer",
  filter: {
    branch: ["main"],
    documentId: ["*"],
    documentType: ["powerhouse/contributor-bill"],
    scope: ["global"],
  },
  block: false,
  label: "contributor-bill-analyzer",
  system: true,
};

export async function transmit(
  strands: InternalTransmitterUpdate[],
  db: PgDatabase<any, any, any>
) {
  for (const strand of strands) {
    handleStrand(strand, db);
  }

  return Promise.resolve();
}

async function handleAddCompensation(
  input: AddCompensationInput,
  db: PgDatabase<any, any, any>
) {
  const [existing] = await db
    .select()
    .from(contributorBillAnalyzer)
    .where(
      and(
        eq(contributorBillAnalyzer.projectCode, input.projectCode),
        eq(contributorBillAnalyzer.token, input.token)
      )
    );
  if (existing) {
    await db
      .update(contributorBillAnalyzer)
      .set({
        amount: input.amount + existing.amount,
        updatedAt: input.updatedAt,
      })
      .where(
        and(
          eq(contributorBillAnalyzer.projectCode, input.projectCode),
          eq(contributorBillAnalyzer.token, input.token)
        )
      );
  } else {
    await db.insert(contributorBillAnalyzer).values(input);
  }
}

async function getCompensation(
  projectCode: string,
  token: string,
  db: PgDatabase<any, any, any>
) {
  const [compensation] = await db
    .select()
    .from(contributorBillAnalyzer)
    .where(
      and(
        eq(contributorBillAnalyzer.projectCode, projectCode),
        eq(contributorBillAnalyzer.token, token)
      )
    );
  return compensation;
}

async function handleRemoveCompensation(
  input: RemoveCompensationInput,
  db: PgDatabase<any, any, any>
) {
  const existing = await getCompensation(input.projectCode, input.token, db);

  if (!existing) {
    return;
  } else if (existing.amount > input.amount) {
    await db
      .update(contributorBillAnalyzer)
      .set({ amount: existing.amount - input.amount })
      .where(
        and(
          eq(contributorBillAnalyzer.projectCode, input.projectCode),
          eq(contributorBillAnalyzer.token, input.token)
        )
      );
  } else {
    await db
      .update(contributorBillAnalyzer)
      .set({ amount: 0 })
      .where(
        and(
          eq(contributorBillAnalyzer.projectCode, input.projectCode),
          eq(contributorBillAnalyzer.token, input.token)
        )
      );
  }
}

async function handleStrand(
  strand: InternalTransmitterUpdate,
  db: PgDatabase<any, any, any>
) {
  const firstOp = strand.operations[0];
  if (firstOp?.index === 0) {
    await db.delete(contributorBillAnalyzer);
  }

  strand.operations.map(async (op: OperationUpdate) => {
    if (op.type === "ADD_COMPENSATION") {
      await handleAddCompensation(op.input as AddCompensationInput, db);
    } else if (op.type === "REMOVE_COMPENSATION") {
      await handleRemoveCompensation(op.input as RemoveCompensationInput, db);
    }
  });
}
