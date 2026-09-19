# Building a Reactor

```ts
import { ReactorBuilder } from "@powerhousedao/reactor";
const reactor = await new ReactorBuilder().withReadModels([]).build();
```

`withReadModels` registers read models. There is no `withReadModel`.
