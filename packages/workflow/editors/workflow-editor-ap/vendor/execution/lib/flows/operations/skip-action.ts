import { FlowVersion } from '../flow-version.js'
import { flowStructureUtil } from '../util/flow-structure-util.js'
import { SkipActionRequest } from './index.js'

export function _skipAction(flowVersion: FlowVersion, request: SkipActionRequest): FlowVersion {
    return flowStructureUtil.transferFlow(flowVersion, (stepToUpdate) => {
        if (!request.names.includes(stepToUpdate.name)) {
            return stepToUpdate
        }
        return {
            ...stepToUpdate,
            skip: request.skip,
        }
    })
}