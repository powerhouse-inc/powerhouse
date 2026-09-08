import AjvNamespace from "ajv";

export type AjvError = {
  readonly instancePath?: string;
  readonly message?: string;
};

export type AjvValidate = ((data: unknown) => boolean) & {
  readonly errors?: readonly AjvError[] | null;
};

type AjvConstructor = new (options?: Record<string, unknown>) => {
  compile(schema: unknown): AjvValidate;
};

export const Ajv = ((AjvNamespace as unknown as { default?: AjvConstructor })
  .default ?? (AjvNamespace as unknown as AjvConstructor)) as AjvConstructor;
