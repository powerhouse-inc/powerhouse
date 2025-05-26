# Sky Dashboard

All consumable data for the Sky ecosystem is available through GraphQL API, which allows you to only fetch the data you require.

The API is available in two environments, a developer environment (DEV) and a production environment. For testing purposes please use the DEV environment. For the latest up to date data with integration or consumption purposes use the production environment.

Both environments are available through Apollo Studio Explorer where the user can find the analytics query and start fetching information from the analytics engine.

### Available Metrics

To see which metrics are available to fetch analytics data, use the below query:

```graphql
query Analytics {
  analytics {
    metrics
  }
}
```

The above query will output the following list, which is described in the dropdown below.

```graphql
{
  "data": {
    "analytics": {
      "metrics": [
        "DailyDaiPriceChange",
        "Budget",
        "DailyUsdcPriceChange",
        "Actuals",
        "DailyUsdpPriceChange",
        "Contributors",
        "Forecast",
        "DailyMkrPriceChange",
        "DailyEthPriceChange",
        "ProtocolNetOutflow",
        "PaymentsOffChainIncluded",
        "PaymentsOnChain"
      ]
    }
  }
}
```

<details>
<summary>👉 Expand this dropdown to explore the list of fields and retrievable data.</summary>

- **Actuals**: This metric represents the recorded amounts that have been actually spent or received. It is used for tracking and comparing against budgeted or forecasted amounts. This will be helpful to understand the real financial performance.

    - Example Use Case: Comparing actual spending against the budget for a specific project to assess financial management efficiency.

- **Budget**: The estimated financial plan for a period, detailing the expected amounts allocated for various expenses and revenues.
    - Example Use Case: Planning financial allocations for upcoming quarters and tracking the distribution of funds across different departments.

- **Forecast**: A projection of future financial outcomes based on current trends and past data. This functions as an educated estimate that helps in planning and strategy.

    - Example Use Case: Anticipating cash flow and financial needs for the next fiscal year to make informed business decisions and adjustments.

- **PaymentsOnChain**: This metric tracks transactions executed on the blockchain, ensuring transparency and immutability of payment records.

    - Example Use Case: Auditing blockchain transactions to ensure the accuracy of financial reporting within decentralized finance operations.

- **PaymentsOffChainIncluded**: Reflects transactions that occur outside the blockchain but are recognized in the financial records, possibly including traditional banking transactions and off-chain payment channels.

    - Example Use Case: Reconciling on-chain and off-chain financial activities to maintain a comprehensive understanding of total expenditures and revenues.

- **DailyDaiPriceChange**: This metric measures the daily fluctuation in the price of DAI in USD. It's crucial for understanding the stability of DAI and its performance against the US dollar on a day-to-day basis.

    - Example Use Case: Monitoring the stability of DAI to ensure it maintains its peg to the US dollar, crucial for financial planning and risk assessment in DAI-denominated transactions.

- **DailyUsdcPriceChange**: Tracks the daily price change of USDC in USD. This metric is important for analyzing USDC's stability and its daily performance relative to the US dollar.

    - Example Use Case: Evaluating the daily fluctuations of USDC to assess its reliability as a stablecoin for operational liquidity and treasury management.

- **DailyUsdpPriceChange**: Reflects the daily price movement of USDP (Pax Dollar) in USD. It provides insights into the daily stability and performance of USDP against the US dollar.

    - Example Use Case: Analyzing USDP's stability for strategic decisions in treasury operations, especially for entities holding or transacting in USDP.

- **DailyMkrPriceChange**: This metric shows the daily variation in the price of MKR in USD. It is vital for stakeholders to track the governance token's market performance on a daily basis.

    - Example Use Case: Investors and MKR holders use this data to make informed decisions regarding buying, selling, or holding MKR based on its daily market performance.

- **DailyEthPriceChange**: Measures the daily price change of Ethereum (ETH) in USD. Given Ethereum's centrality to the DeFi ecosystem, this metric is key for evaluating the daily market dynamics of ETH.

    - Example Use Case: DeFi participants and investors track ETH's price fluctuations to adjust their investment strategies, hedge risks, and capitalize on market movements.

</details>

### Available Dimensions

To see the available dimensions use the query below:

```graphql
query Analytics {
  analytics {
    dimensions {
      name
      values {
        path
        label
        description
        icon
      }
    }
  }
}
```

The output of the query above: 

```graphql
{
  "data": {
    "analytics": {
      "dimensions": [
        {
          "name": "budget",
          "values": [
            {
              "path": "atlas/legacy/recognized-delegates/",
              "label": null,
              "description": null,
              "icon": null
            }
          ]
        },
        {
          "name": "category",
          "values": [
            {
              "path": "atlas/headcount/CompensationAndBenefits/",
              "label": null,
              "description": null,
              "icon": null
            }
          ]
        },
        {
          "name": "wallet",
          "values": [
            {
              "path": "atlas/0xbe8e3e3618f7474f8cb1d074a26affef007e98fb/",
              "label": null,
              "description": null,
              "icon": null
            }
          ]
        },
        {
          "name": "project",
          "values": [
            {
              "path": "atlas/Flip Flap Flop Delegate LLC/",
              "label": null,
              "description": null,
              "icon": null
            }
          ]
        },
        {
          "name": "report",
          "values": [
            {
              "path": "atlas/Delegates/null/2021/11/",
              "label": null,
              "description": null,
              "icon": null
            }
          ]
        },
        {
          "name": "transactionType",
          "values": [
            {
              "path": "atlas/Internal Transaction/",
              "label": null,
              "description": null,
              "icon": null
            },
          ]
        },
        {
          "name": "priceData",
          "values": [
            {
              "path": "atlas/price-data/mkr-usd/day-average/",
              "label": null,
              "description": null,
              "icon": null
            }
          ]
        }
      ]
    }
  }
}
```

<details>

<summary> Expand this dropdown to explore the list of fields and retrievable data.</summary>

**Budget**
    - **Description**: Refers to the allocation and utilization of funds within different projects or operational areas. It includes various budget categories such as recognized delegates, specific projects, and governance facilitation.

- **Values**:
    - Paths like `atlas/legacy/recognized-delegates/` and `atlas/scopes/SUP/I/PHOENIX/` represent different budget categories or segments.
    - Labels, descriptions, and icons are provided for more detailed budget segments, aiding in identifying specific budget areas and their purposes.

**Category**
    - **Description**: Categorizes transactions or allocations into broader groups like compensation, benefits, or non-headcount expenses.
    - **Values**:
        - Paths like `atlas/headcount/CompensationAndBenefits/` and `atlas/non-headcount/` help segregate financial data into meaningful categories for analysis.

**Wallet**
    - **Description**: Tracks transactions or balances associated with specific blockchain wallet addresses.
    - **Values**:
        - Each path, like `atlas/0xbe8e3e3618f7474f8cb1d074a26affef007e98fb/`, corresponds to a unique wallet address, enabling financial tracking at the wallet level.

**Project**
    - **Description**: Represents different projects or initiatives within the MakerDAO ecosystem.
    - **Values**:
        - Paths such as `atlas/Flip Flap Flop Delegate LLC/` and `atlas/Feedblack Loops LLC/` designate various projects, facilitating project-specific financial analysis and reporting.

**Report**
    - **Description**: Used for accessing specific financial reports, typically segmented by time (e.g., monthly, quarterly).
    - **Values**:
        - Paths like `atlas/Delegates/null/2021/11/` represent report segments, often organized by date, allowing users to access financial information for specific time periods.

**TransactionType**
    - **Description**: Differentiates between various types of transactions within the MakerDAO ecosystem. This dimension helps in analyzing transaction flows, such as internal transfers, governance actions, or external payments.
    - **Values**:
        - A path like `atlas/Internal Transaction/` signifies a specific category of transaction, in this case, internal transactions within the organization. This allows for a focused analysis of internal fund movements or operational transactions.

**PriceData**
    - **Description**: Provides access to historical price data for different cryptocurrencies, facilitating financial analysis and market trend observations. This dimension is crucial for tracking the day-to-day or historical price movements of tokens like MKR, DAI, etc.
    - **Values**:
        - Paths such as `atlas/price-data/mkr-usd/day-average/` offer access to daily average prices of MKR in USD, enabling detailed analysis of MKR's price performance over time. This can be invaluable for financial reporting, investment analysis, or economic research within the MakerDAO ecosystem.
</details>

### Currency

To specify the currency in your analytics queries, use the following approach:

1. Setting the Currency: Specify the currency as either "DAI" or "MKR" in the currency field of your filter object, depending on which currency's data you wish to analyze.

2. Query Example:

```graphql
query Analytics($filter: AnalyticsFilter) {
  analytics(filter: $filter) {
    series {
      period
      start
      end
      rows {
        dimensions {
          name
          path
        }
        metric
        unit
        value
        sum
      }
    }
  }
}

```

With filters for MKR:

```graphql
{
  "filter": {
    "start": "2023-01-01",
    "end": "2024-01-01",
    "granularity": "total",
    "metrics": ["Budget"],
    "dimensions": [{"name": "budget", "select": "atlas", "lod": 3}],
    "currency": "MKR"
  }
}
```
This query will return budget data in MKR for the specified time frame and dimension.

3. Consistency in Currency Specification: It's essential to be consistent in specifying the currency for each query. If your analysis involves comparing data across both DAI and MKR, ensure that separate queries are made for each currency and the results are appropriately labeled and distinguished.

4. Impact of Currency Choice: The choice of currency can significantly impact the insights derived from the analytics. While DAI provides a stable measure for financial planning and tracking, MKR offers insights into governance and decision-making aspects of the ecosystem.

By appropriately specifying the currency in your queries, you can tailor the financial analysis to suit the specific needs of your investigation, whether it be transactional stability with DAI or governance dynamics with MKR.

### Examples of Filter Configurations

1. Analyzing MKR Budgets for a Specific Period:

```graphql
{
  "filter": {
    "start": "2023-01-01",
    "end": "2024-01-01",
    "granularity": "total",
    "metrics": ["Budget"],
    "dimensions": [
      {
        "name": "budget",
        "select": "atlas",
        "lod": 3
      }
    ],
    "currency": "MKR"
  }
}
```
This configuration fetches total MKR budget data for the entire year of 2023, focusing on the 'budget' dimension with a specific level of detail.

2. Comprehensive Yearly Financial Analysis in DAI:

```graphql
{
  "filter": {
    "start": "2023-01-01",
    "end": "2023-12-31",
    "granularity": "annual",
    "metrics": ["Actuals", "Forecast"],
    "dimensions": [
      {
        "name": "category",
        "select": "atlas",
        "lod": 2
      }
    ],
    "currency": "DAI"
  }
}

```
This filter setup is designed to provide an annual overview of actuals and forecast data across all categories in DAI for the year 2023.

These examples demonstrate how to construct a complete filter object for different types of financial analysis. By properly defining each parameter, users can ensure accurate and relevant data retrieval from the analytics engine.

### Multicurrency Series

#### Overview

The `multiCurrencySeries` is a new feature introduced to the MakerDAO Analytics Engine, which significantly enhances the engine's capabilities by allowing for currency conversions within the data analytics process. This addition enables users to view financial data in multiple currencies, making the analytics engine a powerful tool for international financial analysis and reporting.

#### Functionality

**Currency Conversion**: The `multiCurrencySeries` enables the conversion of financial data from the base series currency (such as MKR) into another specified currency (like DAI).

The conversion is based on the available price change metrics in the analytics engine. To see all available price change metrics in the engine, use the metricsfield in the query to get a list:

```graphql	
 "metrics": [
        "Actuals",
        "Budget",
        "Contributors",
        "DailyDaiPriceChange",
        "DailyEthPriceChange",
        "DailyMkrPriceChange",
        "DailyUsdcPriceChange",
        "DailyUsdpPriceChange",
        "Forecast",
        "PaymentsOffChainIncluded",
        "PaymentsOnChain",
        "ProtocolNetOutflow"
      ],
```

So far the engine covers the below price change metrics.

```graphql
"DailyDaiPriceChange",
"DailyEthPriceChange",
"DailyMkrPriceChange",
"DailyUsdcPriceChange",
"DailyUsdpPriceChange",
```

In the future, there could become more metrics available for different purposes, such as Monthly`currency` PriceChange. These can be used in the `multiCurrencySeries` to get the required data.

**Flexibility**: Users can now request and analyze financial data in different currencies, providing flexibility for international stakeholders who operate in various monetary units.

#### How it works

1. Base Series Currency: Initially, the analytics engine aggregates data in the base currency of the series. For example, budget numbers might be originally calculated in MKR.

2. Conversion Request: Through the multiCurrencySeries, a user can request these figures to be converted into another currency, such as DAI.

3. Conversion Mechanism: The engine utilizes the daily average exchange rates to convert the data from the base currency to the target currency.

4. Data Retrieval: The converted data is then retrieved as part of the analytics query, allowing users to analyze financials directly in the currency of their choice.

#### Query Structure

The query structure for fetching multicurrency data is similar to the standard analytics query, with the addition of the `multicurrencySeries` field and relevant subfields for specifying the conversion criteria.

```graphql
query MultiCurrencySeries($filter: MultiCurrencyConversions) {
  analytics {
    multiCurrencySeries(filter: $filter) {
      period
      start
      end
      rows {
        dimensions {
          name
          path
        }
        metric
        unit
        value
        sum
      }
    }
  }
}

// Variables
{
  "filter": {
    "start": "2023-10-01",
    "end": "2024-01-01",
    "granularity": "monthly",
    "metrics": [
      "Budget"
    ],
    "dimensions": [
      {
        "name": "budget",
        "select": "atlas",
        "lod": 1
      }
    ],
    "currency": "DAI",
    "conversions": [
      {
        "metric": "DailyMkrPriceChange",
        "sourceCurrency": "MKR"
      }
    ]
  }
}

```

**Example Use Case**

- **Budget Analysis in Different Currencies**: A user can analyze the MakerDAO budget in both MKR and DAI, viewing how the budget figures translate between the governance token and the stablecoin. This can be particularly useful for reports that need to present financial data in a currency that is more widely used or understood by the audience.

#### Writing Queries

Writing queries in the analytics engine involves constructing structured requests to retrieve specific data. Here’s a step-by-step guide to help you write a basic query.

**Step 1: Understand Your Data Requirements**

Before writing a query, clearly define what data you need. Determine the metrics, time period, granularity, dimensions, and currency relevant to your analysis.

**Step 2: Open Your GraphQL Interface**

Access the analytics engine through a GraphQL interface, like Apollo Studio or another GraphQL client.

**Step 3: Start with the Query Structure**

Every query begins with the keyword query, followed by an optional name, and the main query field. In our case, it’s `Analytics`:

```graphql
query MyAnalyticsQuery {
  analytics {
    series(filter: $filter)
    ...
  }
}

```

**Step 4: Define the Filter Object**

The `filter` object is crucial and must be complete. It includes parameters like start, end, granularity, metrics, dimensions, and currency. Define this object according to your data requirements:

```graphql
{
  "filter": {
    "start": "2023-01-01",
    "end": "2023-12-31",
    "granularity": "monthly",
    "metrics": [
      "Budget",
      "Actuals"
    ],
    "dimensions": [
      {
        "name": "budget",
        "select": "atlas",
        "lod": 1
      }
    ],
    "currency": "DAI"
  }
}
```

**Step 5: Specify the Data to Retrieve**

In the body of the `analytics` field, specify what data you want to retrieve. This typically includes fields like `series`,`period`,`start`,`end`,`rows` , and any sub-fields under `rows` such as `metric` , `value` , `unit` , `sum` , and `dimensions`. For example:

```graphql
query MyAnalyticsQuery($filter: AnalyticsFilter) {
  analytics {
    series(filter: $filter) {
      period
      start
      end
      rows {
        dimensions {
          name
          path
          label
          description
          icon
        }
        metric
        unit
        value
        sum
      }
    }
  }
}

```

**Step 6: Execute the Query**

Once you have constructed the query, execute it in your GraphQL interface. Ensure that the filter object is passed correctly as a variable. In most interfaces, there’s a separate section or panel where you can define these variables.

**Step 7: Review the Results**

After executing the query, review the results to ensure they align with your expectations. If the results are not as expected, revisit your query to check for any errors or adjustments needed in the filter parameters.

**Step 8: Iterate and Refine**

Query writing is often an iterative process. Based on the initial results, you might need to refine your query for more precise data or broader insights.

By following these steps, you can effectively write and execute queries in the analytics engine, tailoring the data retrieval to your specific analytical needs.

### Query Examples

Example 1: Fetching Total MakerDAO Actual Expenses and Budget for 2023

```graphql
query Analytics($filter: AnalyticsFilter) {
  analytics {
    series(filter: $filter) {
      period
      start
      end
      rows {
        dimensions {
          name
          path
        }
        metric
        unit
        value
        sum
      }
    }
  }
}

// Filter
{
  "filter": {
    "start": "2023-01-01",
    "end": "2024-01-31",
    "granularity": "total",
    "metrics": [
      "Budget",
      "Actuals"
    ],
    "dimensions": [
      {
        "name": "budget",
        "select": "atlas",
        "lod": 1
      }
    ],
    "currency": "DAI"
  }
}
```

Explanation

- This query fetches the total actual expenses and budget for MakerDAO for the entire year of 2023.
- The granularity is set to "total" to aggregate data across the whole year.
metrics include "Actuals" and "Budget" to get both actual spendings and budgeted amounts.
- The currency is set to "DAI" to ensure all financial data is in the DAI format.

Modification for Custom Use Cases

- To modify this for a different time period, adjust the start and end dates.
- For a different currency, change the currency field to "MKR" or another supported currency.

Example 2: Fetching total actuals and budget for the SES Core Unit for the year of 2023.

```graphql
query Analytics($filter: AnalyticsFilter) {
  analytics {
    series(filter: $filter) {
      period
      start
      end
      rows {
        dimensions {
          name
          path
        }
        metric
        unit
        value
        sum
      }
    }
  }
}

// filter
{
  "filter": {
    "start": "2023-01-01",
    "end": "2024-01-31",
    "granularity": "total",
    "metrics": [
      "Budget",
      "Actuals"
    ],
    "dimensions": [
      {
        "name": "budget",
        "select": "atlas/legacy/core-units/SES-001",
        "lod": 4
      }
    ],
    "currency": "DAI"
  }
}
```
