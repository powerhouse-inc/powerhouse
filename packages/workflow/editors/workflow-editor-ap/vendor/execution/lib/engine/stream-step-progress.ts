// ph: leaf copies of two engine-operation exports, breaking the runtime
// import cycle engine-operation <-> flow-run (upstream bundlers tolerate it).
import { z } from 'zod'

export enum StreamStepProgress {
    WEBSOCKET = 'WEBSOCKET',
    NONE = 'NONE',
}

export const TriggerPayload = z.object({
    body: z.unknown(),
    rawBody: z.unknown().optional(),
    method: z.string().optional(),
    headers: z.record(z.string(), z.string()),
    queryParams: z.record(z.string(), z.string()),
})

export type TriggerPayload<T = unknown> = {
    body: T
    rawBody?: unknown
    method?: string
    headers: Record<string, string>
    queryParams: Record<string, string>
}

export const UpdateStepProgressRequest = z.object({
    projectId: z.string(),
    runId: z.string(),
    output: z.unknown(),
    sequence: z.number().optional(),
})
export type UpdateStepProgressRequest = z.infer<typeof UpdateStepProgressRequest>

