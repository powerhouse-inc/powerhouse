import { Timer } from 'lucide-react';
import { useMemo } from 'react';

import { useBuilderStateContext } from '../../../builder-hooks.js';
import { TextWithTooltip } from '../../../../../components/custom/text-with-tooltip.js';
import { flowRunUtils } from '../../../../../../../shims/flow-runs.js';
import { formatUtils } from '../../../../../../../shims/format-utils.js';
import { cn } from '../../../../../lib/utils.js';

const StepNodeRunDuration = ({ duration }: { duration: number }) => {
  return (
    <div className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
      <Timer className="size-3" />
      <span>{formatUtils.formatDuration(duration, true)}</span>
    </div>
  );
};

const StepNodeRunDurationAndPieceName = ({
  stepName,
  pieceDisplayName,
}: {
  stepName: string;
  pieceDisplayName: string;
}) => {
  const [run, loopIndexes, flowVersion, canvasOrientation] =
    useBuilderStateContext((state) => [
      state.run,
      state.loopsIndexes,
      state.flowVersion,
      state.canvasOrientation,
    ]);
  const isHorizontal = canvasOrientation === 'horizontal';
  const selectedStepOutput = useMemo(() => {
    return run && run.steps
      ? flowRunUtils.extractStepOutput(stepName, loopIndexes, run.steps)
      : null;
  }, [run, stepName, loopIndexes, flowVersion.trigger]);

  return (
    <div
      className={cn('flex mt-0.5 w-full items-center', {
        'justify-between': !isHorizontal,
        'justify-center': isHorizontal,
      })}
    >
      <TextWithTooltip
        tooltipMessage={pieceDisplayName}
        key={pieceDisplayName + selectedStepOutput?.duration}
      >
        <div
          className={cn('text-xs text-muted-foreground truncate grow shrink', {
            'w-full': !isHorizontal,
            'text-center': isHorizontal,
          })}
        >
          {pieceDisplayName}
        </div>
      </TextWithTooltip>
      {selectedStepOutput && (
        <StepNodeRunDuration duration={selectedStepOutput?.duration ?? 0} />
      )}
    </div>
  );
};
StepNodeRunDurationAndPieceName.displayName = 'StepNodeRunDurationAndPieceName';
export { StepNodeRunDurationAndPieceName };
