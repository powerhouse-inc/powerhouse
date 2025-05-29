# PHDocument

### Summary

We break PHDocument into four objects:

```tsx
{
	header,    // meta
	
	state,     // plain, serializable object
	
	mutations, // typed API for creting and/or executing operations
	
	history,   // typed API for fetching document history
}
```

The state will generally be filled in according to the `ViewFilter` that is passed into the reactor client. For instance, when scopes are set to `["global"]`, then only the global state is returned on the state object. When `headerOnly` is set to true, the `state` object will not be populated at all.

### Links

* [Usage](usage.md)
