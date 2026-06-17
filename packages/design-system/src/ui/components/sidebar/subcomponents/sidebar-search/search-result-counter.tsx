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
    return <div className="h-4 w-6 animate-pulse rounded-sm bg-secondary" />;
  }

  return (
    <div className="text-xs">
      {totalResults > 0 ? (
        <>
          <span className="text-foreground">{activeIndex + 1}</span>
          <span className="text-muted-foreground">/{totalResults}</span>
        </>
      ) : (
        <span className="text-muted-foreground">0/0</span>
      )}
    </div>
  );
};
