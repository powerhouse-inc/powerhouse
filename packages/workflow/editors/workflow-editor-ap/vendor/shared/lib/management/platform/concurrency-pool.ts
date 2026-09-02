import { ApId, BaseModelSchema } from '../../../../core-utils/index.js'
import { z } from 'zod'

export const ConcurrencyPool = z.object({
    ...BaseModelSchema,
    platformId: ApId,
    key: z.string(),
    maxConcurrentJobs: z.number().int().positive(),
})
export type ConcurrencyPool = z.infer<typeof ConcurrencyPool>
