import { FlowAction } from '../actions/action.js'
import { FlowVersion } from '../flow-version.js'
import { flowStructureUtil } from '../util/flow-structure-util.js'
import { addActionUtils } from './add-action-util.js'
import { _getImportOperations } from './import-flow.js'
import { FlowOperationRequest, FlowOperationType, StepLocationRelativeToParent } from './index.js'


export type InsideBranchPasteLocation = {
    branchIndex: number
    stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH
    parentStepName: string
}

export type OutsideBranchPasteLocation = {
    parentStepName: string
    stepLocationRelativeToParent:
    | StepLocationRelativeToParent.AFTER
    | StepLocationRelativeToParent.INSIDE_LOOP
    | StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH
    | StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH
}

export type PasteLocation = InsideBranchPasteLocation | OutsideBranchPasteLocation

export const _getOperationsForPaste = (
    actions: FlowAction[],
    flowVersion: FlowVersion,
    pastingDetails: PasteLocation,
) => {
    const newNamesMap = addActionUtils.mapToNewNames(flowVersion, actions)
    const clonedActions: FlowAction[] = actions.map(action => flowStructureUtil.transferStep(action, (step: FlowAction) => {
        return addActionUtils.clone(step, newNamesMap)
    }) as FlowAction)
    const operations: FlowOperationRequest[] = []
    for (let i = 0; i < clonedActions.length; i++) {
        if (i === 0) {
            operations.push({
                type: FlowOperationType.ADD_ACTION,
                request: {
                    action: clonedActions[i],
                    parentStep: pastingDetails.parentStepName,
                    stepLocationRelativeToParent: pastingDetails.stepLocationRelativeToParent,
                    branchIndex: pastingDetails.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_BRANCH ? pastingDetails.branchIndex : undefined,
                },
            })
        }
        else {
            operations.push({
                type: FlowOperationType.ADD_ACTION,
                request: {
                    action: clonedActions[i],
                    parentStep: clonedActions[i - 1].name,
                    stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
                },
            })
        }
        const importOperations = _getImportOperations(clonedActions[i])
        operations.push(...importOperations)
    }
    return operations
}
