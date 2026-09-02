import { isNil } from '../../../../../../core-utils/index.js';
import {
  FlowTriggerType,
  FlowVersionState,
  flowStructureUtil,
} from '../../../../../../shared/index.js';
import { t } from '../../../../../../../shims/i18n.js';
import { RouteOff } from 'lucide-react';

import { flowRunUtils } from '../../../../../../../shims/flow-runs.js';

import { useBuilderStateContext } from '../../../builder-hooks.js';
import { flowCanvasUtils } from '../../utils/flow-canvas-utils.js';

import { StepNodeBadgeContainer } from './step-node-badge-container.js';

const ApStepNodeSkippedStatus = ({ stepName }: { stepName: string }) => {
  const [run, stepType, isInDraft, isSkipped] = useBuilderStateContext(
    (state) => [
      state.run,
      flowStructureUtil.getStep(stepName, state.flowVersion.trigger)?.type,
      state.flowVersion.state === FlowVersionState.DRAFT,
      flowCanvasUtils.isSkipped(stepName, state.flowVersion.trigger),
    ],
  );

  const hasRun = !isNil(run);
  const shouldShowSkippedStatus =
    isSkipped && (isInDraft || hasRun) && stepType !== FlowTriggerType.EMPTY;

  if (!shouldShowSkippedStatus) {
    return null;
  }

  return (
    <StepNodeBadgeContainer>
      <div
        className={flowRunUtils.getStatusContainerClassName('default', true)}
      >
        <RouteOff className="size-3" />
        <div>{t('Skipped')}</div>
      </div>
    </StepNodeBadgeContainer>
  );
};

ApStepNodeSkippedStatus.displayName = 'ApStepNodeSkippedStatus';
export { ApStepNodeSkippedStatus };
