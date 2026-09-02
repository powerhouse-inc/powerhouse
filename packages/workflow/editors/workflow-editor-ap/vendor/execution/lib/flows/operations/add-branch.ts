import { insertAt } from '../../../../core-utils/index.js'
import { FlowActionType, type RouterAction } from '../actions/action.js'
import { FlowVersion } from '../flow-version.js'
import { flowStructureUtil } from '../util/flow-structure-util.js'
import { AddBranchRequest } from './index.js'


function _addBranch(flowVersion: FlowVersion, request: AddBranchRequest): FlowVersion {
    return flowStructureUtil.transferFlow(flowVersion, (parentStep) => {
        if (parentStep.name !== request.stepName || parentStep.type !== FlowActionType.ROUTER) {
            return parentStep
        }
        const routerAction = parentStep as RouterAction
        return {
            ...routerAction,
            settings: {
                ...routerAction.settings,
                branches: insertAt(routerAction.settings.branches, request.branchIndex, flowStructureUtil.createBranch(request.branchName, request.conditions)),
            },
            children: insertAt(routerAction.children, request.branchIndex, null),
        }
    })
}


export { _addBranch }