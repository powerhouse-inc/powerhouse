import { t } from '../../../../../shims/i18n.js';
import { ArrowLeftIcon } from 'lucide-react';

import { SearchInput } from '../../../components/custom/search-input.js';
import { Button } from '../../../components/ui/button.js';
import { usePieceSearchContext } from '../stores/piece-search-context.js';
import {
  PieceSelectorTabType,
  usePieceSelectorTabs,
} from '../stores/piece-selector-tabs-provider.js';

type PiecesSearchInputProps = {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (query: string) => void;
};

const PiecesSearchInput = ({
  searchInputRef,
  onSearchChange,
}: PiecesSearchInputProps) => {
  const { searchQuery, setSearchQuery } = usePieceSearchContext();
  const {
    resetToBeforeNoneWasSelected: resetToPreviousValue,
    setSelectedTab,
    selectedPieceInExplore,
    selectedTab,
    setSelectedPieceInExplore,
  } = usePieceSelectorTabs();
  const showBackButton =
    selectedPieceInExplore && selectedTab === PieceSelectorTabType.EXPLORE;
  return (
    <div className="p-2 flex gap-2 items-center">
      {showBackButton && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSelectedPieceInExplore(null);
          }}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
      )}
      <SearchInput
        placeholder={t('Search')}
        value={searchQuery}
        data-testid="pieces-search-input"
        ref={searchInputRef}
        onChange={(e) => {
          setSearchQuery(e);
          onSearchChange(e);
          if (e === '') {
            resetToPreviousValue();
          } else {
            setSelectedTab(PieceSelectorTabType.NONE);
          }
        }}
      />
    </div>
  );
};
PiecesSearchInput.displayName = 'PiecesSearchInput';
export { PiecesSearchInput };
