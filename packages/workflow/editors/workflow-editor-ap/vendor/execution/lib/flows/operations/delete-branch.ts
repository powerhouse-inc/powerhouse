import { FlowActionType, type RouterAction } from '../actions/action.js'
import { FlowVersion } from '../flow-version.js'
import { flowStructureUtil } from '../util/flow-structure-util.js'
import { DeleteBranchRequest } from './index.js'

function _deleteBranch(flowVersion: FlowVersion, request: DeleteBranchRequest): FlowVersion {
    return flowStructureUtil.transferFlow(flowVersion, (parentStep) => {
        if (parentStep.name !== request.stepName || parentStep.type !== FlowActionType.ROUTER) {
            return parentStep
        }
        const routerAction = parentStep as RouterAction
        return {
            ...routerAction,
            settings: {
                ...routerAction.settings,
                branches: routerAction.settings.branches.filter((_, index) => index !== request.branchIndex),
            },
            children: routerAction.children.filter((_, index) => index !== request.branchIndex),
        }
    })
}

export { _deleteBranch } 