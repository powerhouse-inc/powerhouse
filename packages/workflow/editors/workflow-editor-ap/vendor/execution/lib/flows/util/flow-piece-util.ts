import { FlowActionType } from '../actions/action.js'
import { FlowTrigger, FlowTriggerType } from '../triggers/trigger.js'
import { flowStructureUtil } from './flow-structure-util.js'

export const flowPieceUtil = {
    getExactVersion(pieceVersion: string): string {
        if (pieceVersion.startsWith('^') || pieceVersion.startsWith('~')) {
            return pieceVersion.slice(1)
        }
        return pieceVersion
    },
    getUsedPieces(trigger: FlowTrigger): string[] {
        return flowStructureUtil.getAllSteps(trigger)
            .filter((step) => step.type === FlowActionType.PIECE || step.type === FlowTriggerType.PIECE)
            .map((step) => step.settings.pieceName)
    },
}
