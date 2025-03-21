interface SearchResultCounterProps {
  isSearching: boolean;
  activeIndex: number;
  totalResults: number;
}

export const SearchResultCounter: React.FC<SearchResultCounterProps> = ({
  isSearching,
  activeIndex,
  totalResults,
}) => {
  if (isSearching) {
    return (
      <div className="h-4 w-6 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-800" />
    );
  }

  return (
    <div className="text-xs">
      {totalResults > 0 ? (
        <>
          <span className="text-gray-700 dark:text-gray-50">
            {activeIndex + 1}
          </span>
          <span className="text-gray-500 dark:text-gray-700">
            /{totalResults}
          </span>
        </>
      ) : (
        <span className="text-gray-500 dark:text-gray-700">0/0</span>
      )}
    </div>
  );
};
