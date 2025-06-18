# Update the Analytics Processor

Now let's implement our custom analytics processor code to calculate the total value of the asset class on a monthly basis.
You will likely already be in the desired directory, but if not, navigate to the project directory and open it.

```bash
cd rwa-analytics
```

Now open the directory with your code editor. 

```bash
code .
```

Open the file `processors/rwa-analytics/index.ts` and replace the existing code with the following below:

To get a better understanding of how the analytics processor work specific for this tutorial, we've added some comments to the code that might help you understand the different parts of the code.

```typescript
import {
  AnalyticsPath,
  type IAnalyticsStore,
  AnalyticsSeriesInput,
} from "@powerhousedao/reactor-api";
import {
  CreateGroupTransactionInput,
} from "document-model-libs/real-world-assets";
import { DateTime } from "luxon";
import { IProcessor } from "document-drive/processors/types";
import { InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { PHDocument } from "document-model";

export class RwaAnalyticsProcessor implements IProcessor {
  constructor(private readonly analyticsStore: IAnalyticsStore) {
    //
  }
  
  // This is the function that is called when the processor receives a new strand.
  async onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[]
  ): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    const values: AnalyticsSeriesInput[] = [];
    for (const strand of strands) {
      // A strand is a collection of operations that are related to a single document and contain the data for the document.
      if (strand.operations.length === 0) {
        continue;
      }

      const documentId = strand.documentId.replace("/", "-");

      // This is the first operation in the strand.
      const firstOp = strand.operations[0];
      const source = AnalyticsPath.fromString(
        // This is the source of the operation, in our case it is the driveId, documentId, branch and scope.
        `ph/${strand.driveId}/${documentId}/${strand.branch}/${strand.scope}`,
      );

      if (firstOp.index === 0) { // This is the index of the operation in the strand.
        // This is the function that clears the source of the operation since there could be data existing from previous runs for the same document to avoid double counting.
        await this.analyticsStore.clearSeriesBySource(source, true);
      }

      for (const operation of strand.operations) {	
        // This is the type of the operation that is being displayed in the terminal.
        console.log(">>> ", operation.type);

        // This is the type of the operation that is being displayed in the terminal.
        if (operation.type === "CREATE_GROUP_TRANSACTION") {
          // This is the input of the operation. See how we're using the GroupTransactionInput type from the document model.
          const groupTransaction =
            operation.input as CreateGroupTransactionInput;
          if (
            ![
              // Although an RWA portfolio could have multiple types of transactions, we're only interested in the ones that are relevant to our analytics.
              "AssetPurchase",
              "AssetSale",
              "PrincipalDraw",
              "PrincipalReturn",
            ].includes(groupTransaction.type)
          ) {
            continue;
          }

          // Up next we'll go through the crucial design decision of defining the different dimensions or categories that are relevant to our analytics and queries. In this case we'll create 2 series values for each transaction type. Cash and Fixed Income transactions.
          const { fixedIncomeTransaction, cashTransaction } =
            groupTransaction;

          if (fixedIncomeTransaction) {
            const dimensions = {
              // We're selecting T-bills as one of the dimensions.
              asset: AnalyticsPath.fromString(
                `sky/rwas/assets/t-bills/${fixedIncomeTransaction.assetId}`
              ),
              // We're selecting the portfolio as another dimension.	
              portfolio: AnalyticsPath.fromString(
                `sky/rwas/portfolios/${documentId}`,
              ),
            };

            values.push({
              dimensions,
              metric: "AssetBalance",	// We're selecting the AssetBalance metric.
              source,
              start: DateTime.fromISO(fixedIncomeTransaction.entryTime),	// We're selecting the entryTime as the start of the series value.
              value:
                groupTransaction.type === "AssetPurchase"
                  ? fixedIncomeTransaction.amount
                  : -fixedIncomeTransaction.amount,
            });
          }

          // We're doing the same thing for cash transactions.
          if (cashTransaction) {
            const dimensions = {
              asset: AnalyticsPath.fromString(`sky/rwas/assets/cash`), // We're selecting cash as one of the dimensions.
              portfolio: AnalyticsPath.fromString(
                `sky/rwas/portfolios/${documentId}`, // We're selecting the portfolio as another dimension since we want to know the cash balance for each portfolio. Each portfolio has a unique documentId. We can then later group or separate by this analytics dimension. We will then also be able to use this dimension to query the cash balance for each portfolio or select a specific portfolio but combine it with other dimensions to get more specific data such as the cash balance for each portfolio for each month. We'll be able to make any combination of hierarchies of dimensions to cut & slice the data we want.
              ),
            };

            values.push({
              dimensions,
              metric: "AssetBalance",	// We're selecting the AssetBalance metric for our tutorial scenario
              source,
              start: DateTime.fromISO(cashTransaction.entryTime),	// We're selecting the entryTime as the start of the series value.
              value:
                groupTransaction.type === "AssetPurchase" ||
                groupTransaction.type === "PrincipalReturn"
                  ? -cashTransaction.amount	
                  : cashTransaction.amount,	
            });
          }
        }
      }
    }

    // Insert all the values into the analytics store at once.
    await this.analyticsStore.addSeriesValues(values);
  }

  async onDisconnect() {}
}
```

Now that we've implemented the analytics processor, we can make it receive the correct data by running the reactor again in our other terminal window. We currently don't support hot reloading yet so we'll need to stop the reactor and start it again. Press `Ctrl + C` in the terminal window of the reactor to stop it and then run `ph reactor` again.

You should now be able to see in the terminal output of the reactor that the processor has received the operations and their details and they are available in the subgraphs. In case you would register a new listener for the analytics processor with a new ID, it would display all the operations from operation 0

Now let's move over to the graphql playground to see the data that has been added to the analytics store.
You'll need to use this specific endpoint to access the graphql playground `http://localhost:4001/analytics`

Then, use this query to get the data from the analytics store, but don't forget to also add the variables below.

```graphql
query analytics ($filter: AnalyticsFilter) {
  analytics {
    series(filter: $filter) {
      start
      period
      rows {
        metric
        sum
        value
        dimensions {
          path
        }
      }
    }
  }
}
```
With the following variables: 

```graphql
{
  "filter": {
    "metrics": ["AssetBalance"],
    "granularity": "monthly",
    "start": "2024-05-01",
    "end": " 2024-12-31",
    "dimensions": [
      {
        "lod": 4,
        "name": "asset",
        "select": "sky"
      }
    ]
  }  
}
```

You'll see that the data is now being displayed per month for each of the asset classes. 

`sum`: Displays the total cumulative sum of the asset class for the month.

`value`: Displays the total change in value of the asset class for that month.

You'll also see that in the month of july the AssetBalance for the "path": "sky/rwas/assets/cash" has increased by 4.000.000 since we sold 4.000.000 worth of T-bills in July.

When you play around with the variables of our query you can see the different granularity of the data that is being displayed on the image below.

![Analytics](./images/granularity.png)

If you would take 'total' you would see the total value left in the portfolio.

To see more changes become present in the analytics store, you could add more transactions to the portfolio. We could do this by adding a rwa portfolio with a different documentId. 
Imagine that this is similar to real time updates that might happen to a live environment when new transactions are added to a porftolio. 

Now you know how to implement a custom analytics processor and how to query the data from the analytics store! 
In case you'd want to try it out on another document model follow the steps below.

1. Generate the processor
2. Update the processor code
3. Launch the processor
4. Launch the reactor (again) and add your data
5. Query the data from the analytics store

Enjoy! 
