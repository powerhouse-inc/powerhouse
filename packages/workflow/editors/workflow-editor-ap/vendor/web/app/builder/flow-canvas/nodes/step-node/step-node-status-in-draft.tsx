import { isNil } from '../../../../../../core-utils/index.js';
import {
  FlowTriggerType,
  FlowVersionState,
  StepOutputStatus,
  flowStructureUtil,
} from '../../../../../../shared/index.js';
import { t } from '../../../../../../../shims/i18n.js';
import { TriangleAlert } from 'lucide-react';
import React, { useMemo } from 'react';

import { InvalidStepIcon } from '../../../../../components/custom/alert-icon.js';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '../../../../../components/ui/tooltip.js';
import { StepStatusIcon, flowRunUtils } from '../../../../../../../shims/flow-runs.js';
import { pieceSelectorUtils } from '../../../../../features/pieces/index.js';

import { useBuilderStateContext } from '../../../builder-hooks.js';
import { flowCanvasUtils } from '../../utils/flow-canvas-utils.js';

import { StepNodeBadgeContainer } from './step-node-badge-container.js';
type DraftStepStatus =
  | 'invalid'
  | 'testing'
  | 'failed'
  | 'needs-test'
  | 'tested'
  | 'untested';

const ApStepNodeStatusInDraft = ({ stepName }: { stepName: string }) => {
  const [
    run,
    isBeingTested,
    hasError,
    lastTestDate,
    lastUpdatedDate,
    stepType,
    isInDraft,
    isStepValid,
    isManualTrigger,
    isSkipped,
  ] = useBuilderStateContext((state) => {
    const step = flowStructureUtil.getStep(stepName, state.flowVersion.trigger);
    const isManualTrigger =
      step?.type === FlowTriggerType.PIECE &&
      pieceSelectorUtils.isManualTrigger({
        pieceName: step?.settings.pieceName,
        triggerName: step?.settings.triggerName ?? '',
      });
    return [
      state.run,
      state.isStepBeingTested(stepName),
      !isNil(state.errorLogs[stepName]),
      step?.settings?.sampleData?.lastTestDate as string | undefined,
      step?.lastUpdatedDate ?? '',
      step?.type,
      state.flowVersion.state === FlowVersionState.DRAFT,
      !!step?.valid,
      isManualTrigger,
      flowCanvasUtils.isSkipped(stepName, state.flowVersion.trigger),
    ];
  });

  const draftStatusConfig: Record<
    DraftStepStatus,
    {
      variant: 'default' | 'success' | 'error' | 'warning';
      text: string;
      icon: React.ReactNode;
    }
  > = {
    invalid: {
      variant: 'warning',
      text: t('Incomplete'),
      icon: <InvalidStepIcon className="size-3" />,
    },
    testing: {
      variant: 'default',
      text: t('Testing...'),
      icon: (
        <StepStatusIcon
          status={StepOutputStatus.RUNNING}
          size="3"
          hideTooltip={true}
        />
      ),
    },
    failed: {
      variant: 'error',
      text: t('Failed'),
      icon: (
        <StepStatusIcon
          status={StepOutputStatus.FAILED}
          size="3"
          hideTooltip={true}
        />
      ),
    },
    'needs-test': {
      variant: 'default',
      text: t('Test me'),
      icon: <TriangleAlert className="size-3" />,
    },
    untested: {
      variant: 'default',
      text: t('Test me'),
      icon: <TriangleAlert className="size-3" />,
    },
    tested: {
      variant: 'success',
      text: t('Tested'),
      icon: (
        <StepStatusIcon
          status={StepOutputStatus.SUCCEEDED}
          size="3"
          hideTooltip={true}
        />
      ),
    },
  };
  const status: DraftStepStatus = useMemo(() => {
    if (!isStepValid) return 'invalid';
    if (isBeingTested) return 'testing';

    if (isNil(lastTestDate)) {
      return 'untested';
    }
    if (lastUpdatedDate > lastTestDate) {
      return 'needs-test';
    }
    if (hasError) return 'failed';

    return 'tested';
  }, [isStepValid, isBeingTested, hasError, lastTestDate, lastUpdatedDate]);

  const hasRun = !isNil(run);
  const shouldShowDraftStatusBadge =
    isInDraft &&
    !hasRun &&
    stepType !== FlowTriggerType.EMPTY &&
    !isManualTrigger &&
    !isSkipped;

  if (!shouldShowDraftStatusBadge) {
    return null;
  }

  const config = draftStatusConfig[status];
  const badgeClassName = flowRunUtils.getStatusContainerClassName(
    config.variant,
    true,
  );

  return (
    <StepNodeBadgeContainer>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={badgeClassName}>
            {config.icon}
            <div>{config.text}</div>
          </div>
        </TooltipTrigger>
        {status === 'untested' && (
          <TooltipContent>
            {t('This step has not been tested yet')}
          </TooltipContent>
        )}
        {status === 'needs-test' && (
          <TooltipContent>
            {t('This step has been updated since the last test')}
          </TooltipContent>
        )}
      </Tooltip>
    </StepNodeBadgeContainer>
  );
};

ApStepNodeStatusInDraft.displayName = 'ApStepNodeStatusInDraft';
export { ApStepNodeStatusInDraft };
