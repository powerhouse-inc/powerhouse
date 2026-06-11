export interface CharacterCounterProps {
  maxLength: number;
  value: string;
}

const counterVariants = {
  normal: "text-gray-500 dark:text-slate-400",
  warning: "text-yellow-900 dark:text-yellow-50",
  error: "text-red-900 dark:text-red-500",
};

const maxLengthVariants = {
  normal: "text-gray-300 dark:text-slate-600",
  warning: "text-yellow-500 dark:text-yellow-50",
  error: "text-red-500 dark:text-red-50",
};

export const CharacterCounter: React.FC<CharacterCounterProps> = ({
  maxLength,
  value,
}) => {
  const remaining = (value.length / maxLength) * 100;
  const state =
    remaining < 90 ? "normal" : remaining <= 100 ? "warning" : "error";

  return (
    <div className="flex items-center text-xs/3">
      <span className={counterVariants[state]}>{value.length}</span>
      <span className={maxLengthVariants[state]}>/{maxLength}</span>
    </div>
  );
};
