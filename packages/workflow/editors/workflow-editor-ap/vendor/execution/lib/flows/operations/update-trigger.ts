import dayjs from 'dayjs'
import { isNil } from '../../../../core-utils/index.js'
import { FlowAction } from '../actions/action.js'
import { FlowVersion } from '../flow-version.js'
import { type SampleDataSettings } from '../sample-data/index.js'
import { FlowTrigger, FlowTriggerType } from '../triggers/trigger.js'
import { flowStructureUtil } from '../util/flow-structure-util.js'
import { UpdateTriggerRequest } from './index.js'


function createTrigger(name: string, request: UpdateTriggerRequest, nextAction: FlowAction | undefined, existingSampleData: SampleDataSettings | undefined): FlowTrigger {
    const baseProperties = {
        displayName: request.displayName,
        name,
        valid: false,
        nextAction,
        lastUpdatedDate: dayjs().toISOString(),
    }
    let trigger: FlowTrigger
    switch (request.type) {
        case FlowTriggerType.EMPTY:
            trigger = {
                ...baseProperties,
                type: FlowTriggerType.EMPTY,
                settings: request.settings,
            }
            break
        case FlowTriggerType.PIECE:
            trigger = {
                ...baseProperties,
                type: FlowTriggerType.PIECE,
                settings: { ...request.settings, sampleData: existingSampleData },
            }
            break
    }
    const parseResult = FlowTrigger.safeParse(trigger)
    const valid = (isNil(request.valid) ? true : request.valid) && parseResult.success
    return {
        ...trigger,
        valid,
    }
}

function _updateTrigger(flowVersion: FlowVersion, request: UpdateTriggerRequest): FlowVersion {
    const trigger = flowStructureUtil.getStepOrThrow(request.name, flowVersion.trigger)
    const existingSampleData = trigger.type === FlowTriggerType.PIECE ? trigger.settings.sampleData : undefined
    const updatedTrigger = createTrigger(request.name, request, trigger.nextAction, existingSampleData)
    const next = flowStructureUtil.transferFlow(flowVersion, (parentStep) => {
        if (parentStep.name === request.name) {
            return updatedTrigger
        }
        return parentStep
    })
    return next
}

export { _updateTrigger }
