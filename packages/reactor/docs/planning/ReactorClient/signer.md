# ISigner

The `ISigner` is an interface that is used to sign `Action` objects before submitting them to the `IReactor`.

```tsx
interface ISigner {
  /**
   * Signs an action
   * 
   * @param action - The action to sign
   * 
   * @returns The signature
   */
  sign(action: Action, abortSignal?: AbortSignal): Promise<Signature>;
}
```
