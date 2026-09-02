import dayjs from 'dayjs'
import { FlowVersion } from '../flow-version.js'
import { flowStructureUtil } from '../util/flow-structure-util.js'
import { UpdateSampleDataInfoRequest } from './index.js'


const _updateSampleDataInfo = (flowVersion: FlowVersion, request: UpdateSampleDataInfoRequest) => {
    return flowStructureUtil.transferFlow(flowVersion, (step) => {
        if (step.name !== request.stepName) {
            return step
        }
        
        return {
            ...step,
            settings: {
                ...step.settings,
                sampleData: request.sampleDataSettings ? {
                    ...request.sampleDataSettings,
                    lastTestDate: dayjs().toISOString(),
                } : undefined,
            },
        }
    })
}

export { _updateSampleDataInfo }