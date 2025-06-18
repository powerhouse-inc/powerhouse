# IReactorClient

### Summary

- Wraps several lower-level APIs to provide a simpler interface to users.
- Provides quality-of-life functions for common tasks.
- Wraps Jobs with Promises.
- Wraps subscription interface with `ViewFilter`s. This means that, for example, while the `ISubscriptionManager` only returns ids for create events, the client allows you to specify a view to auto-populate.
- Manages signing of submitted `Action` objects.

### Signing

Inside of the `IReactor`, the [`IJobExecutor`](../Jobs/index.md) verifies signatures before executing but it does not sign `Action` objects.

Instead, the `IReactorClient` will sign `Action` objects before submitting them to the `IReactor`. It will do this using an `ISigner` object that is passed to the `IReactorClient` constructor.

### Dependencies

- [IReactor](../Reactor/index.md)
- [IReactorSubscriptionManager](../Subscriptions/index.md)
- [ISigner](signer.md)

### Links

* [Interface](interface.md)
* [Usage](usage.md)
