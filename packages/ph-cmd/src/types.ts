export type CommandActionType<Args extends any[], Return = void> = (
  ...args: Args
) => Return | Promise<Return>;
