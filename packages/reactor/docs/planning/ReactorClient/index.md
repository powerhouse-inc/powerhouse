# IReactorClient

### Summary

- Wraps several lower-level APIs to provide a simpler interface to users.
- Provides quality-of-life functions for common tasks.
- Wraps Jobs with Promises.
- Wraps subscription interface with `ViewFilter`s. This means that, for example, while the `ISubscriptionManager` only returns ids for create events, the client allows you to specify a view to auto-populate.

### Dependencies

- [IReactor](../Reactor/index.md)
- [IReactorSubscriptionManager](../Subscriptions/index.md)

### Links

* [Interface](interface.md)
* [Usage](usage.md)
