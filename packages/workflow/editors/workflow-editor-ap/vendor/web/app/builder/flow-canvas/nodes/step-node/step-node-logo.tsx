import { useBuilderStateContext } from '../../../builder-hooks.js';
import { ImageWithColorBackground } from '../../../../../../../shims/image-with-color-background.js';
import { cn } from '../../../../../lib/utils.js';

const StepNodeLogo = ({
  isSkipped,
  logoUrl,
  displayName,
}: {
  isSkipped: boolean;
  logoUrl: string;
  displayName: string;
}) => {
  const canvasOrientation = useBuilderStateContext(
    (state) => state.canvasOrientation,
  );
  const isHorizontal = canvasOrientation === 'horizontal';
  return (
    <div
      className={cn('flex items-center justify-center rounded-sm shrink-0', {
        'opacity-80': isSkipped,
      })}
    >
      <ImageWithColorBackground
        src={logoUrl}
        alt={displayName}
        key={logoUrl + displayName}
        border={true}
        className={cn({
          'w-9 h-9 p-2': !isHorizontal,
          'w-12 h-12 p-2.5': isHorizontal,
        })}
        roundedCorner={true}
      />
    </div>
  );
};

export { StepNodeLogo };
