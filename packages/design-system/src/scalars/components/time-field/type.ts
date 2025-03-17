export type TimeFieldValue = string | undefined;

export type TimePeriod = "AM" | "PM";

export interface TimeSelectorProps {
  options: string[];
  selectedValue: string;
  onSelect: (value: string) => void;
  isCyclic?: boolean;
}
