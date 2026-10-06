/** A call the Switchboard GraphQL surface cannot express. */
export class GraphQLOperationNotSupportedError extends Error {
  readonly name = "GraphQLOperationNotSupportedError";
  readonly operation: string;

  constructor(operation: string, reason: string) {
    super(`GraphQLReactorClient.${operation} is not supported: ${reason}`);
    this.operation = operation;
  }

  static isError(error: unknown): error is GraphQLOperationNotSupportedError {
    return (
      Error.isError(error) && error.name === "GraphQLOperationNotSupportedError"
    );
  }
}
