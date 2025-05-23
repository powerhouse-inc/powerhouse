# Database Schema

![untitled](../images/dbs.png)
*Database table structures for the analytics engine.*

Analytics information  is stored in three database tables: 

- `AnalyticsSeries`: This table stores the raw data over a period with its metric, value, unit, function and parameters.
- `AnalyticsDimension`: This table stores all available dimensions for each series.
- `AnalyticsSeries_AnalyticsDimension`: Many to many lookup table, storing relationships between series and dimensions.

The `browser` package automatically creates this schema in the PGLite instance.

The `postgres` package, on the other hand, [contains an init script](https://github.com/powerhouse-inc/analytics-engine/blob/main/pg/test/scripts/initdb.sh) that can be used to create the correct schema in your database.
