# Logging

This project contains a logging interface that is used throughout related projects (like `reactor` and `connect`).

### Quickstart

The interface works exactly like the `console` API:

```
import { logger } from "document-drive";

logger.info("hey!");
```

### Child Loggers

Sometimes it is nice to create "scoped" loggers, that will wrap logs with tags.

```
import { childLogger } from "document-drive";

const logger = childLogger("MySystem");

logger.info("Hello!"); // Outputs: "[MySystem] Hello!"
```

### Log Levels

Setting the level on a logger will filter out all logs below the set level.

```
logger.level = "warn";

logger.debug(...); // no output
logger.info(...); // no output
logger.warn("Hello!"); // Output: "Hello!"
```

This is determined in this priority order:

```
verbose
debug
info
warn
error
silent
```

#### `powerhouse.config.json` + `.env`

While each logger may have its own log level, all loggers default to a log level of `"env"`. This level follows, you guessed it, the environment value for logging.

This is a dynamic approach that allows the environment value to be set at compile time with `.env` for example, or at runtime with the loading of a `powerhouse.config.json`. Either way, the loggers will dynamically follow the `process.env` (or `import.meta.env` in the case of Connect) value.

This lets us leave logs in code like this across a bunch of systems:

```
const logger = childLogger("MySystem");
logger.verbose("Debug info!");
```

Yet switch them on by updating `powerhouse.config.json`:

```
{
  ...,

  "logLevel": "verbose",

  ...
}
```

### Error Handler

A global error handler may be also be set, which can forward error logs along to other sources.

```
import { setErrorHandler } from 'document-drive';

setErrorHandler(forwardErrorToSentry);
```
