import { z } from 'zod'
import * as zMini from 'zod/mini'
import { BaseModelSchema, Nullable } from '../../../core-utils/index.js'
import { ApId } from '../../../core-utils/index.js'
import { Metadata } from '../../../core-utils/index.js'
import { TriggerSource, WebhookHandshakeConfiguration } from '../../../piece-types/index.js'
import { FlowVersion } from './flow-version.js'

type FlowId = ApId
export enum FlowStatus {
    ENABLED = 'ENABLED',
    DISABLED = 'DISABLED',
}

export enum FlowOperationStatus {
    NONE = 'NONE',
    DELETING = 'DELETING',
    /** @deprecated No longer set — status changes are now synchronous via distributed lock */
    ENABLING = 'ENABLING',
    /** @deprecated No longer set — status changes are now synchronous via distributed lock */
    DISABLING = 'DISABLING',
}

export const FlowCreatorType = {
    MCP: 'MCP',
    AGENT: 'AGENT',
} as const
export type FlowCreatorType = typeof FlowCreatorType[keyof typeof FlowCreatorType]

export const FlowCreator = z.discriminatedUnion('type', [
    z.object({ type: z.literal(FlowCreatorType.MCP), id: ApId }),
    z.object({ type: z.literal(FlowCreatorType.AGENT), id: ApId }),
])
export type FlowCreator = z.infer<typeof FlowCreator>

export const flowExecutionStateKey = (flowId: FlowId) => `flow-execution-state:${flowId}`

export type FlowExecutionState = {
    exists: false
} | {
    exists: true
    handshakeConfiguration: WebhookHandshakeConfiguration | undefined
    flow: Flow
    platformId: string
}
export const Flow = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    externalId: z.string(),
    ownerId: Nullable(z.string()),
    folderId: Nullable(z.string()),
    status: z.nativeEnum(FlowStatus),
    publishedVersionId: Nullable(z.string()),
    metadata: Nullable(Metadata),
    /** @deprecated Only DELETING is actively used — ENABLING/DISABLING are no longer set */
    operationStatus: z.nativeEnum(FlowOperationStatus),
    timeSavedPerRun: Nullable(z.number()),
    templateId: Nullable(z.string()),
    createdBy: Nullable(FlowCreator),
})

export type Flow = z.infer<typeof Flow>
export const PopulatedFlow = Flow.extend({
    version: FlowVersion,
    triggerSource: zMini.optional(zMini.pick(TriggerSource, { schedule: true })),
})

export type PopulatedFlow = z.infer<typeof PopulatedFlow>


export const PopulatedTriggerSource = zMini.extend(TriggerSource, {
    flow: Flow,
})
export type PopulatedTriggerSource = z.infer<typeof PopulatedTriggerSource>
