const renderNumberCell = (value: unknown) => {
  return <div className="text-right font-semibold">{value as number}</div>;
};

export { renderNumberCell };
