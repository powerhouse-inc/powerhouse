# Processors

Processors are objects that allow document-model authors to respond to operation updates. The `IProcessorManager` is responsible for subscribing to `JOB_COMPLETED` events from the `IEventBus` and calling the `update` method on the appropriate processors.

## Eventual Consistency

## Links

- [Interface](interface.md)
