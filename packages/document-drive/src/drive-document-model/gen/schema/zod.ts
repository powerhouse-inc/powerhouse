import type {
  AddFileInput,
  AddFolderInput,
  AddListenerInput,
  AddTriggerInput,
  CopyNodeInput,
  DeleteNodeInput,
  DocumentDriveLocalState,
  DocumentDriveState,
  FileNode,
  FolderNode,
  ListenerCallInfo,
  ListenerFilter,
  MoveNodeInput,
  PullResponderTriggerData,
  RemoveListenerInput,
  RemoveTriggerInput,
  Listener,
  SetAvailableOfflineInput,
  SetDriveIconInput,
  SetDriveNameInput,
  SetSharingTypeInput,
  Trigger,
  UpdateFileInput,
  UpdateNodeInput,
} from "document-drive";
import { z } from "zod";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const TransmitterTypeSchema = z.enum([
  "Internal",
  "MatrixConnect",
  "PullResponder",
  "RESTWebhook",
  "SecureConnect",
  "SwitchboardPush",
]);

export const TriggerTypeSchema = z.enum(["PullResponder"]);

export function AddFileInputSchema(): z.ZodObject<Properties<AddFileInput>> {
  return z.object({
    documentType: z.string(),
    id: z.string(),
    name: z.string(),
    parentFolder: z.string().nullish(),
  });
}

export function AddFolderInputSchema(): z.ZodObject<
  Properties<AddFolderInput>
> {
  return z.object({
    id: z.string(),
    name: z.string(),
    parentFolder: z.string().nullish(),
  });
}

export function AddListenerInputSchema(): z.ZodObject<
  Properties<AddListenerInput>
> {
  return z.object({
    listener: ListenerSchema(),
  });
}

export function AddTriggerInputSchema(): z.ZodObject<
  Properties<AddTriggerInput>
> {
  return z.object({
    trigger: TriggerSchema(),
  });
}

export function CopyNodeInputSchema(): z.ZodObject<Properties<CopyNodeInput>> {
  return z.object({
    srcId: z.string(),
    targetId: z.string(),
    targetName: z.string().nullish(),
    targetParentFolder: z.string().nullish(),
  });
}

export function DeleteNodeInputSchema(): z.ZodObject<
  Properties<DeleteNodeInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function DocumentDriveLocalStateSchema(): z.ZodObject<
  Properties<DocumentDriveLocalState>
> {
  return z.object({
    __typename: z.literal("DocumentDriveLocalState").optional(),
    availableOffline: z.boolean(),
    listeners: z.array(ListenerSchema()),
    sharingType: z.string().nullable(),
    triggers: z.array(TriggerSchema()),
  });
}

export function DocumentDriveStateSchema(): z.ZodObject<
  Properties<DocumentDriveState>
> {
  return z.object({
    __typename: z.literal("DocumentDriveState").optional(),
    icon: z.string().nullable(),
    name: z.string(),
    nodes: z.array(NodeSchema()),
  });
}

export function FileNodeSchema(): z.ZodObject<Properties<FileNode>> {
  return z.object({
    __typename: z.literal("FileNode").optional(),
    documentType: z.string(),
    id: z.string(),
    kind: z.string(),
    name: z.string(),
    parentFolder: z.string().nullable(),
  });
}

export function FolderNodeSchema(): z.ZodObject<Properties<FolderNode>> {
  return z.object({
    __typename: z.literal("FolderNode").optional(),
    id: z.string(),
    kind: z.string(),
    name: z.string(),
    parentFolder: z.string().nullable(),
  });
}

export function ListenerSchema(): z.ZodObject<Properties<Listener>> {
  return z.object({
    __typename: z.literal("Listener").optional(),
    block: z.boolean(),
    callInfo: ListenerCallInfoSchema().nullable(),
    filter: ListenerFilterSchema(),
    label: z.string().nullable(),
    listenerId: z.string(),
    system: z.boolean(),
  });
}

export function ListenerCallInfoSchema(): z.ZodObject<
  Properties<ListenerCallInfo>
> {
  return z.object({
    __typename: z.literal("ListenerCallInfo").optional(),
    data: z.string().nullable(),
    name: z.string().nullable(),
    transmitterType: TransmitterTypeSchema.nullable(),
  });
}

export function ListenerFilterSchema(): z.ZodObject<
  Properties<ListenerFilter>
> {
  return z.object({
    __typename: z.literal("ListenerFilter").optional(),
    branch: z.array(z.string()).nullable(),
    documentId: z.array(z.string()).nullable(),
    documentType: z.array(z.string()),
    scope: z.array(z.string()).nullable(),
  });
}

export function MoveNodeInputSchema(): z.ZodObject<Properties<MoveNodeInput>> {
  return z.object({
    srcFolder: z.string(),
    targetParentFolder: z.string().nullish(),
  });
}

export function NodeSchema() {
  return z.union([FileNodeSchema(), FolderNodeSchema()]);
}

export function PullResponderTriggerDataSchema(): z.ZodObject<
  Properties<PullResponderTriggerData>
> {
  return z.object({
    __typename: z.literal("PullResponderTriggerData").optional(),
    interval: z.string(),
    listenerId: z.string(),
    url: z.string(),
  });
}

export function RemoveListenerInputSchema(): z.ZodObject<
  Properties<RemoveListenerInput>
> {
  return z.object({
    listenerId: z.string(),
  });
}

export function RemoveTriggerInputSchema(): z.ZodObject<
  Properties<RemoveTriggerInput>
> {
  return z.object({
    triggerId: z.string(),
  });
}

export function SetAvailableOfflineInputSchema(): z.ZodObject<
  Properties<SetAvailableOfflineInput>
> {
  return z.object({
    availableOffline: z.boolean(),
  });
}

export function SetDriveIconInputSchema(): z.ZodObject<
  Properties<SetDriveIconInput>
> {
  return z.object({
    icon: z.string(),
  });
}

export function SetDriveNameInputSchema(): z.ZodObject<
  Properties<SetDriveNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetSharingTypeInputSchema(): z.ZodObject<
  Properties<SetSharingTypeInput>
> {
  return z.object({
    type: z.string(),
  });
}

export function TriggerSchema(): z.ZodObject<Properties<Trigger>> {
  return z.object({
    __typename: z.literal("Trigger").optional(),
    data: TriggerDataSchema().nullable(),
    id: z.string(),
    type: TriggerTypeSchema,
  });
}

export function TriggerDataSchema() {
  return PullResponderTriggerDataSchema();
}

export function UpdateFileInputSchema(): z.ZodObject<
  Properties<UpdateFileInput>
> {
  return z.object({
    documentType: z.string().nullish(),
    id: z.string(),
    name: z.string().nullish(),
    parentFolder: z.string().nullish(),
  });
}

export function UpdateNodeInputSchema(): z.ZodObject<
  Properties<UpdateNodeInput>
> {
  return z.object({
    id: z.string(),
    name: z.string().nullish(),
    parentFolder: z.string().nullish(),
  });
}
