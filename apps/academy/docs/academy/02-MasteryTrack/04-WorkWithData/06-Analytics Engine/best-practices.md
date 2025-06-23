---
sidebar_position: 1000
---

# Best Practices

### GraphQL

**Start general, end with detailed queries.** In the case you want to find a specific number for a specific metric and dimension, the rule of thumb is to start general in the filter definitions and slowly start cutting down the paths to a particular team or budget period.

For example: Looking at the dimension section in the filter options: To see available sub paths for the budget, leave the select: "atlas" and lod as 5 . With lod:5 you’ll be able to see the different paths available under your defined filter. Then, later you can apply a more detailed path in the select: "atlas/..." path that will suit your needs.

```graphql
{
  "filter": {
  ...
    "dimensions": [
      {
        "name": "budget",
        "select": "atlas",
        "lod": 5
      }
    ],
   ...
  }
}
```

**Follow upper case, lower case rules.** To make sure to get the results you require, you must follow the upper or lower case styling for defining the metrics and granularity. To see the available metrics and dimensions just use the referenced queries. For granularity, check the above granularity section for the different types.

**Fetch per specified path** if performance is an issue.

### Guidelines for Selecting and Combining Dimensions

1. **Understand the Purpose of Analysis**  
Before selecting dimensions, clarify the objective of your analysis. Are you looking to track expenses for a specific project, analyze budget utilization, or examine transaction patterns? Your objective will guide which dimensions are most relevant.

2. **Choose Relevant Dimensions**  
Select dimensions that align with your analytical goals. For instance, use the 'Project' dimension for project-based financial tracking or 'Wallet' for blockchain transaction analysis.

3. **Combining Dimensions for Depth**  
Combine multiple dimensions to gain more nuanced insights. For example, you might combine 'Budget' and 'Category' to understand how different categories of expenses contribute to overall budget utilization within a specific area.

4. **Hierarchy and Path Considerations**  
Pay attention to the hierarchical structure in dimension paths. For instance, paths like atlas/scopes/SUP/I/PHOENIX/ suggest a structured breakdown that can be crucial for detailed analysis.

5. **Utilize Descriptions for Context**  
Where available, use the descriptions provided with dimension values to understand the context and relevance of each dimension to your analysis. This is particularly helpful in dimensions with null labels, where the path and description provide critical information.

6. **Avoid Over-Complication**  
While combining dimensions can provide depth, avoid overly complex combinations that might lead to confusing or inconclusive results. Stick to combinations that directly serve your analysis objectives.

7. **Use Icons for Quick Reference**  
Where icons are available, they can be used as a quick visual reference to identify different dimensions or categories, particularly in user interfaces where rapid identification is beneficial.

8. **Experiment and Iterate**  
Don’t hesitate to experiment with different combinations of dimensions to see which provide the most meaningful insights. The flexibility of the dimensions allows for various permutations and combinations to suit diverse analytical needs.

9. **Stay Updated**  
Keep abreast of any changes or additions to the dimensions within the analytics engine, as this can impact ongoing and future analyses.