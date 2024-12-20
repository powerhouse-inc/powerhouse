export interface CharacterCounterProps {
  maxLength: number;
  value: string;
}

const counterVariants = {
  normal: "text-gray-500",
  warning: "text-orange-900",
  error: "text-red-900",
};

const maxLengthVariants = {
  normal: "text-gray-300",
  warning: "text-orange-400",
  error: "text-red-400",
};

export const CharacterCounter: React.FC<CharacterCounterProps> = ({
  maxLength,
  value,
}) => {
  const remaining = (value.length / maxLength) * 100;
  const state =
    remaining < 90 ? "normal" : remaining <= 100 ? "warning" : "error";

  return (
    <div className="flex items-center text-[10px]">
      <span className={counterVariants[state]}>{value.length}</span>
      <span className={maxLengthVariants[state]}>/{maxLength}</span>
    </div>
  );
};
