export type DateFieldValue = string | Date | undefined;
export type DatePickerView = "years" | "months" | "days";
export type WeekStartDayNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined;

export type ValueTransformerFn = (value?: any) => any;

export type TransformerTrigger = "blur" | "change" | "keyDown";

export type TransformerObject = {
  /**
   * The transformer function
   */
  transformer: ValueTransformerFn;
  options?: {
    /**
     * The event that triggers the transformer.
     * @default "blur"
     */
    trigger?: TransformerTrigger;
    /**
     * If true, the transformer will be applied.
     * @default true
     */
    if?: boolean;
  };
};

export type TransformerType = TransformerObject[] | ValueTransformerFn[];

export interface ValueTransformerProps {
  transformers: TransformerType;
  children: React.ReactElement;
}
