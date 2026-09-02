import { z } from 'zod'
import { ApId } from '../../../core-utils/index.js'

export enum TriggerTestStrategy {
    SIMULATION = 'SIMULATION',
    TEST_FUNCTION = 'TEST_FUNCTION',
}

export const TestTriggerRequestBody = z.object({
    projectId: ApId,
    flowId: ApId,
    flowVersionId: ApId,
    testStrategy: z.nativeEnum(TriggerTestStrategy),
})

export type TestTriggerRequestBody = z.infer<typeof TestTriggerRequestBody>


export const CancelTestTriggerRequestBody = z.object({
    projectId: ApId,
    flowId: ApId,
})

export type CancelTestTriggerRequestBody = z.infer<typeof CancelTestTriggerRequestBody>
