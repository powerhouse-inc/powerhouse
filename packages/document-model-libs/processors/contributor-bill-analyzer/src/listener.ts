import { InternalTransmitterUpdate, Listener } from "document-drive";
import { and, eq } from "drizzle-orm";
import { PgDatabase } from "drizzle-orm/pg-core";
import {
  AddPowtLineItemInput,
  DeletePowtLineItemInput,
  UpdatePowtLineItemInput,
} from "../../../document-models/contributor-bill";
import { contributorBillAnalyzer, powtLineItem } from "./schema";

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
  console.log("transmitting strands", strands);
  for (const strand of strands) {
    await handleStrand(strand, db);
  }

  return Promise.resolve();
}

async function handleAddPowtLineItem(
  input: AddPowtLineItemInput,
  db: PgDatabase<any, any, any>
) {
  console.log("adding powt line item", input);
  const result = await db
    .insert(powtLineItem)
    .values({ ...input, projectCode: input.projectCode ?? "" })
    .returning()
    .catch(console.log);

  if (result) {
    await recalcualateProjectCode(result[0].projectCode!, db);
  }
}

async function handleUpdatePowtLineItem(
  input: UpdatePowtLineItemInput,
  db: PgDatabase<any, any, any>
) {
  const [entry] = await db
    .select()
    .from(powtLineItem)
    .where(eq(powtLineItem.id, input.powtLineItemId));

  if (!entry) {
    return;
  }

  await db
    .update(powtLineItem)
    .set({
      ...input,
      amount: input.amount ?? 0,
      projectCode: input.projectCode ?? "",
    })
    .where(eq(powtLineItem.id, input.powtLineItemId));

  await recalcualateProjectCode(entry.projectCode!, db);
}

async function handleDeletePowtLineItem(
  input: DeletePowtLineItemInput,
  db: PgDatabase<any, any, any>
) {
  const [entry] = await db
    .delete(powtLineItem)
    .where(eq(powtLineItem.id, input.powtLineItemId))
    .returning();

  await recalcualateProjectCode(entry.projectCode!, db);
}

async function recalcualateProjectCode(
  projectCode: string,
  db: PgDatabase<any, any, any>
) {
  const powtLineItems = await db
    .select()
    .from(powtLineItem)
    .where(eq(powtLineItem.projectCode, projectCode));

  const amount = powtLineItems.reduce((acc, item) => acc + item.amount, 0);

  const [existing] = await db
    .select()
    .from(contributorBillAnalyzer)
    .where(eq(contributorBillAnalyzer.projectCode, projectCode));

  if (existing) {
    await db
      .update(contributorBillAnalyzer)
      .set({ amount, updatedAt: new Date() })
      .where(eq(contributorBillAnalyzer.projectCode, projectCode));
  } else {
    await db.insert(contributorBillAnalyzer).values({
      projectCode,
      amount,
      token: "POWT",
      updatedAt: new Date(),
    });
  }
}

async function handleStrand(
  strand: InternalTransmitterUpdate,
  db: PgDatabase<any, any, any>
) {
  for (const op of strand.operations) {
    if (op.type === "ADD_POWT_LINE_ITEM") {
      await handleAddPowtLineItem(op.input as AddPowtLineItemInput, db);
    } else if (op.type === "UPDATE_POWT_LINE_ITEM") {
      await handleUpdatePowtLineItem(op.input as UpdatePowtLineItemInput, db);
    } else if (op.type === "DELETE_POWT_LINE_ITEM") {
      await handleDeletePowtLineItem(op.input as DeletePowtLineItemInput, db);
    }
  }
}
