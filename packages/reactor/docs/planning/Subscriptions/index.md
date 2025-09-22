# IReactorSubscriptionManager

### Summary

- Manages relationships between `SearchFilter` and subscriber callbacks.
- Provides an explicitly named interface rather than a general one for clarity.
- Consumes the `IEventBus` interface, providing a higher-level abstraction for application developers.
- **Requires an error handler** to ensure robust error management and guaranteed delivery.
- Guarantees that all subscribers receive notifications even if individual callbacks fail.

### Key Features

#### Error Handling
- **Required Error Handler**: The `ReactorSubscriptionManager` constructor requires an `ISubscriptionErrorHandler` to handle subscription callback errors.
- **Default Implementation**: A `DefaultSubscriptionErrorHandler` is provided that re-throws errors with enhanced context.
- **Custom Handlers**: Implement custom error handlers for logging, monitoring, or recovery strategies.

#### Guaranteed Delivery
- If a subscription callback throws an error, it doesn't affect other subscriptions.
- All subscribers are notified even if some fail.
- Errors are handled through the error handler with detailed context.

#### Subscription Management
- Each subscription method returns an unsubscribe function for easy cleanup.
- Subscriptions can be filtered using `SearchFilter` and `ViewFilter` parameters.
- Supports multiple subscriptions to the same event type.

### Dependencies

- [IEventBus](../Events/index.md)
- `ISubscriptionErrorHandler`

### Links

- [Interface](interface.md)
- [Usage](usage.md)
