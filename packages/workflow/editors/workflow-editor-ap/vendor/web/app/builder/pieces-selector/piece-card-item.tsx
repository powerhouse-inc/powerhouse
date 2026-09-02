import { useRef } from 'react';

import { CardListItem } from '../../../components/custom/card-list.js';
import {
  PieceIcon,
  type PieceSelectorOperation,
  type StepMetadataWithSuggestions,
  PIECE_SELECTOR_ELEMENTS_HEIGHTS,
} from '../../../features/pieces/index.js';
import { useIsMobile } from '../../../../../shims/use-mobile.js';
import { wait } from '../../../../../shims/dom-utils.js';
import { cn } from '../../../lib/utils.js';

import { useBuilderStateContext } from '../builder-hooks.js';

import { PieceActionsOrTriggersList } from './piece-actions-or-triggers-list.js';

type PieceCardListItemProps = {
  pieceMetadata: StepMetadataWithSuggestions;
  searchQuery: string;
  operation: PieceSelectorOperation;
  isTemporaryDisabledUntilNextCursorMove: boolean;
};

const PieceCardListItem = ({
  pieceMetadata,
  searchQuery,
  operation,
  isTemporaryDisabledUntilNextCursorMove,
}: PieceCardListItemProps) => {
  const isMobile = useIsMobile();
  const showSuggestions = searchQuery.length > 0 || isMobile;
  const isMouseOver = useRef(false);
  const selectPieceMetatdata = async () => {
    if (isTemporaryDisabledUntilNextCursorMove || showSuggestions) {
      return;
    }
    isMouseOver.current = true;
    await wait(250);
    if (isMouseOver.current) {
      setSelectedPieceMetadataInPieceSelector(pieceMetadata);
    }
  };
  const [
    selectedPieceMetadataInPieceSelector,
    setSelectedPieceMetadataInPieceSelector,
  ] = useBuilderStateContext((state) => [
    state.selectedPieceMetadataInPieceSelector,
    state.setSelectedPieceMetadataInPieceSelector,
  ]);
  const itemHeight = PIECE_SELECTOR_ELEMENTS_HEIGHTS.PIECE_ITEM_HEIGHT;
  return (
    <>
      <CardListItem
        className={cn('flex-col p-3 gap-1 items-start truncate', {
          'hover:bg-transparent!': isTemporaryDisabledUntilNextCursorMove,
        })}
        style={{ height: `${itemHeight}px`, maxHeight: `${itemHeight}px` }}
        selected={
          selectedPieceMetadataInPieceSelector?.displayName ===
            pieceMetadata.displayName && searchQuery.length === 0
        }
        interactive={!showSuggestions}
        onMouseEnter={selectPieceMetatdata}
        onMouseMove={selectPieceMetatdata}
        onClick={() => {
          if (!showSuggestions) {
            setSelectedPieceMetadataInPieceSelector(pieceMetadata);
          }
        }}
        onMouseLeave={() => {
          isMouseOver.current = false;
        }}
        id={pieceMetadata.displayName}
        data-testid={pieceMetadata.displayName}
      >
        <div className="flex gap-2 items-center h-full">
          <PieceIcon
            logoUrl={pieceMetadata.logoUrl}
            displayName={pieceMetadata.displayName}
            showTooltip={false}
            size={'sm'}
          />
          <div className="grow h-full flex items-center justify-left text-sm">
            {pieceMetadata.displayName}
          </div>
        </div>
      </CardListItem>

      {showSuggestions && (
        <div>
          <PieceActionsOrTriggersList
            stepMetadataWithSuggestions={pieceMetadata}
            hidePieceIconAndDescription={true}
            operation={operation}
          />
        </div>
      )}
    </>
  );
};

PieceCardListItem.displayName = 'PieceCardListItem';
export { PieceCardListItem };
