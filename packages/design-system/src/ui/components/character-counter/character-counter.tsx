export interface CharacterCounterProps {
  maxLength: number;
  value: string;
}

const counterVariants = {
  normal: "text-gray-500 dark:text-slate-100",
  warning: "text-yellow-900 dark:text-yellow-400",
  error: "text-red-900 dark:text-red-400",
};

const maxLengthVariants = {
  normal: "text-gray-300 dark:text-slate-700",
  warning: "text-yellow-400 dark:text-yellow-900",
  error: "text-red-400 dark:text-red-900",
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
