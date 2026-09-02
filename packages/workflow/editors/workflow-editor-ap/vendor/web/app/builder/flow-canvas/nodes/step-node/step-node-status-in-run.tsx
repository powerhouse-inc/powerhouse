import { t } from '../../../../../../../shims/i18n.js';
import { useMemo } from 'react';

import { StepStatusIcon, flowRunUtils } from '../../../../../../../shims/flow-runs.js';

import { useBuilderStateContext } from '../../../builder-hooks.js';
import { flowCanvasUtils } from '../../utils/flow-canvas-utils.js';

import { StepNodeBadgeContainer } from './step-node-badge-container.js';

const ApStepNodeStatusInRun = ({ stepName }: { stepName: string }) => {
  const [run, loopIndexes] = useBuilderStateContext((state) => [
    state.run,
    state.loopsIndexes,
  ]);
  const stepStatusInRun = useMemo(() => {
    return flowCanvasUtils.getStepStatus(stepName, run, loopIndexes);
  }, [stepName, run, loopIndexes]);
  if (!stepStatusInRun) {
    return null;
  }
  const { variant, text } = stepStatusInRun
    ? flowRunUtils.getStatusIconForStep(stepStatusInRun)
    : ({ variant: 'default', text: t('Testing...') } as const);
  return (
    <StepNodeBadgeContainer>
      <div className={flowRunUtils.getStatusContainerClassName(variant, true)}>
        <StepStatusIcon
          status={stepStatusInRun}
          size="3"
          hideTooltip={true}
        ></StepStatusIcon>
        <div>{text}</div>
      </div>
    </StepNodeBadgeContainer>
  );
};
ApStepNodeStatusInRun.displayName = 'ApStepNodeStatus';

export { ApStepNodeStatusInRun };
