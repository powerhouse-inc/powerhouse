const rwaQuery = `... on RealWorldAssets {
  state {
      portfolio {
          __typename
          ... on FixedIncome {
              name
              CUSIP
              purchaseDate
              purchasePrice
              purchaseProceeds
              salesProceeds
              totalDiscount
              spvId
          }
          ... on Cash {
              id
              balance
          }
      }
      transactions {
          id
          type
          entryTime
          cashBalanceChange
          fees {
              id
              serviceProviderFeeTypeId
              amount
          }
          txRef
          cashTransaction {
              id
              assetId
              amount
              entryTime
              tradeTime
              settlementTime
              accountId
              counterPartyAccountId
          }
          fixedIncomeTransaction {
              id
              assetId
              amount
              entryTime
              tradeTime
              settlementTime
              accountId
              counterPartyAccountId
          }
      }
  }
}`;

const accountSnapshot = `... on AccountSnapshot {
    state {
      id
      ownerId
      ownerType
      period
      start
      end
      actualsComparison {
        month
        reportedActuals
        currency
        netExpenses {
          offChainIncluded {amount difference}
          onChainOnly {amount difference}
        }
      }
      snapshotAccount {
        id
        accountLabel
        accountAddress
        accountType
        groupAccountId
        offChain
        upstreamAccountId
      }
    }
  }`;

const budgetStatement = `... on BudgetStatement {
    state {
      month
      quoteCurrency
      accounts {
        name
        address
        lineItems {
          actual
          payment
          budgetCap
        }
      }
      ftes {
        value
      }
    }
  }`;

const getQuery = (documentId: string, documentType: string) => {
    let query = ``;

    if (documentType === 'powerhouse/account-snapshot') {
        query = accountSnapshot;
    }

    if (documentType === 'powerhouse/budget-statement') {
        query = budgetStatement;
    }

    if (documentType === 'makerdao/rwa-portfolio') {
        query = rwaQuery;
    }

    return encodeURIComponent(`query {
        document(id:"${documentId}") {
            name
            documentType
            revision
            created
            lastModified
            ${query}
          }
      }`);
};

export const getSwitchboardUrl = (
    remoteUrl: string,
    documentType: string,
    documentId: string,
) => {
    const explorerUrl = remoteUrl.replace(/\/d\//, '/graphql/');
    const query = getQuery(documentId, documentType);
    const url = explorerUrl + `?query=${query}`;

    return url.toString();
};
