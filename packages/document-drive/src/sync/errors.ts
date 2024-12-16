export interface IDuplicatedTransmitterError
  extends IError<"DuplicatedTransmitterError"> {
  listenerId: string;
  transmitterType: TransmitterType;
}

export class DuplicatedTransmitterError
  extends Error
  implements IDuplicatedTransmitterError
{
  type = "DuplicatedTransmitterError" as const;

  constructor(
    public listenerId: string,
    public transmitterType: TransmitterType,
  ) {
    super(
      `A ${transmitterType} transmitter for listener with id "${listenerId}" already exists.`,
    );
  }
}

export interface IInitTransmittersError
  extends IError<"InitTransmittersError"> {
  errors: Error[];
}

export class InitTransmittersError
  extends Error
  implements IInitTransmittersError
{
  type = "InitTransmittersError" as const;

  constructor(public errors: Error[]) {
    super("Some transmitters could not be initialized.");
  }
}
