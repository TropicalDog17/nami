export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Nami Portfolio API (Lite)",
    version: "0.2.0",
    description:
      "Transaction-based portfolio backend with accounts, vaults, reporting, and pricing.",
  },
  servers: [{ url: "http://localhost:8080", description: "Local dev" }],
  components: {
    schemas: {
      Asset: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["CRYPTO", "FIAT"] },
          symbol: { type: "string", example: "BTC" },
        },
        required: ["type", "symbol"],
      },
      Rate: {
        type: "object",
        properties: {
          asset: { $ref: "#/components/schemas/Asset" },
          rateUSD: { type: "number", example: 42000 },
          timestamp: { type: "string", format: "date-time" },
          source: {
            type: "string",
            enum: ["COINGECKO", "EXCHANGE_RATE_HOST", "FIXED"],
          },
        },
        required: ["asset", "rateUSD", "timestamp", "source"],
      },
      Transaction: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          type: {
            type: "string",
            enum: ["INITIAL", "INCOME", "EXPENSE", "BORROW", "LOAN", "REPAY"],
          },
          asset: { $ref: "#/components/schemas/Asset" },
          amount: { type: "number" },
          createdAt: { type: "string", format: "date-time" },
          account: { type: "string", example: "Binance" },
          note: { type: "string" },
          rate: { $ref: "#/components/schemas/Rate" },
          usdAmount: { type: "number" },
          counterparty: { type: "string" },
          direction: { type: "string", enum: ["BORROW", "LOAN"] },
        },
        required: [
          "id",
          "type",
          "asset",
          "amount",
          "createdAt",
          "rate",
          "usdAmount",
        ],
      },
      InitialRequest: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                asset: { $ref: "#/components/schemas/Asset" },
                amount: { type: "number" },
                account: { type: "string" },
                note: { type: "string" },
                at: { type: "string", format: "date-time" },
              },
              required: ["asset", "amount"],
            },
          },
        },
        required: ["items"],
      },
      IncomeExpenseRequest: {
        type: "object",
        properties: {
          asset: { $ref: "#/components/schemas/Asset" },
          amount: { type: "number" },
          account: { type: "string" },
          note: { type: "string" },
          at: { type: "string", format: "date-time" },
        },
        required: ["asset", "amount"],
      },
      BorrowLoanRequest: {
        type: "object",
        properties: {
          asset: { $ref: "#/components/schemas/Asset" },
          amount: { type: "number" },
          account: { type: "string" },
          counterparty: { type: "string" },
          note: { type: "string" },
          at: { type: "string", format: "date-time" },
        },
        required: ["asset", "amount"],
      },
      RepayRequest: {
        type: "object",
        properties: {
          asset: { $ref: "#/components/schemas/Asset" },
          amount: { type: "number" },
          account: { type: "string" },
          direction: { type: "string", enum: ["BORROW", "LOAN"] },
          counterparty: { type: "string" },
          note: { type: "string" },
          at: { type: "string", format: "date-time" },
        },
        required: ["asset", "amount", "direction"],
      },
      HoldingsRow: {
        type: "object",
        properties: {
          asset: { type: "string" },
          account: { type: "string" },
          quantity: { type: "number" },
          value_usd: { type: "number" },
          value_vnd: { type: "number" },
          percentage: { type: "number" },
          last_updated: { type: "string", format: "date-time" },
        },
      },
      HoldingsSummary: {
        type: "object",
        properties: {
          by_asset: {
            type: "object",
            additionalProperties: {
              type: "object",
              properties: {
                quantity: { type: "number" },
                value_usd: { type: "number" },
                value_vnd: { type: "number" },
                percentage: { type: "number" },
              },
            },
          },
          total_value_usd: { type: "number" },
          total_value_vnd: { type: "number" },
          last_updated: { type: "string", format: "date-time" },
        },
      },
      Vault: {
        type: "object",
        properties: {
          name: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "CLOSED"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      VaultEntry: {
        type: "object",
        properties: {
          vault: { type: "string" },
          type: { type: "string", enum: ["DEPOSIT", "WITHDRAW"] },
          asset: { $ref: "#/components/schemas/Asset" },
          amount: { type: "number" },
          usdValue: { type: "number" },
          at: { type: "string", format: "date-time" },
          account: { type: "string" },
          note: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/health": {
      get: {
        summary: "Health check (API)",
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/transactions": {
      get: {
        summary: "List all transactions",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Transaction" },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Unified create (buy/sell convenience)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/api/transactions/{id}": {
      delete: {
        summary: "Delete a transaction by id",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "204": { description: "Deleted" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/transactions/initial": {
      post: {
        summary: "Create initial holdings",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InitialRequest" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/api/transactions/income": {
      post: {
        summary: "Create income",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/IncomeExpenseRequest" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/api/transactions/expense": {
      post: {
        summary: "Create expense",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/IncomeExpenseRequest" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/api/transactions/borrow": {
      post: {
        summary: "Create borrow (liability)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BorrowLoanRequest" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/api/transactions/loan": {
      post: {
        summary: "Create loan (receivable)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BorrowLoanRequest" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/api/transactions/repay": {
      post: {
        summary: "Create repayment",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RepayRequest" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },

    "/api/reports/holdings": {
      get: {
        summary: "Portfolio holdings rows (by asset and account)",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/HoldingsRow" },
                },
              },
            },
          },
        },
      },
    },
    "/api/reports/holdings/summary": {
      get: {
        summary: "Holdings summary",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HoldingsSummary" },
              },
            },
          },
        },
      },
    },

    "/api/prices/daily": {
      get: {
        summary: "Simple daily price",
        parameters: [
          { name: "symbol", in: "query", schema: { type: "string" } },
          {
            name: "currency",
            in: "query",
            schema: { type: "string", default: "USD" },
          },
          {
            name: "start",
            in: "query",
            schema: { type: "string", format: "date" },
          },
          {
            name: "end",
            in: "query",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: { "200": { description: "OK" } },
      },
    },

    "/api/fx/today": {
      get: {
        summary: "FX rate for today",
        parameters: [
          {
            name: "from",
            in: "query",
            schema: { type: "string", example: "USD" },
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string", example: "VND" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    rate: { type: "number" },
                    date: { type: "string", format: "date" },
                  },
                },
              },
            },
          },
        },
      },

      "/api/fx/history": {
        get: {
          summary: "Historical FX rate(s) for a date range (inclusive)",
          parameters: [
            {
              name: "from",
              in: "query",
              schema: { type: "string", example: "USD" },
            },
            {
              name: "to",
              in: "query",
              schema: { type: "string", example: "VND" },
            },
            {
              name: "start",
              in: "query",
              schema: { type: "string", format: "date" },
            },
            {
              name: "end",
              in: "query",
              schema: { type: "string", format: "date" },
            },
          ],
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", format: "date" },
                        rate: { type: "number" },
                        from: { type: "string" },
                        to: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },

        "/api/actions": {
          post: {
            summary: "Perform action (spot_buy)",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      action: { type: "string", example: "spot_buy" },
                      params: {
                        type: "object",
                        properties: {
                          date: { type: "string", example: "2025-12-01" },
                          exchange_account: {
                            type: "string",
                            example: "Binance",
                          },
                          base_asset: { type: "string", example: "BTC" },
                          quote_asset: { type: "string", example: "USD" },
                          quantity: { type: "number", example: 0.01 },
                          price_quote: { type: "number", example: 43000 },
                          fee_percent: { type: "number", example: 0.1 },
                        },
                      },
                    },
                  },
                },
              },
            },
            responses: {
              "201": { description: "Created" },
              "200": { description: "OK" },
            },
          },
        },

        // Vaults
        "/api/vaults": {
          get: {
            summary: "List vaults",
            parameters: [
              { name: "is_open", in: "query", schema: { type: "boolean" } },
              { name: "enrich", in: "query", schema: { type: "boolean" } },
            ],
            responses: { "200": { description: "OK" } },
          },
          post: {
            summary: "Create vault",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { name: { type: "string" } },
                    required: ["name"],
                  },
                },
              },
            },
            responses: { "201": { description: "Created" } },
          },
        },
        "/api/vaults/{name}": {
          get: {
            summary: "Get vault",
            parameters: [
              {
                name: "name",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: {
              "200": { description: "OK" },
              "404": { description: "Not found" },
            },
          },
        },
        "/api/vaults/{name}/transactions": {
          get: {
            summary: "List vault entries",
            parameters: [
              {
                name: "name",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
        "/api/vaults/{name}/deposit": {
          post: {
            summary: "Deposit to vault",
            parameters: [
              {
                name: "name",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      asset: { $ref: "#/components/schemas/Asset" },
                      amount: { type: "number" },
                      at: { type: "string" },
                      account: { type: "string" },
                      note: { type: "string" },
                      affect_account: { type: "boolean" },
                    },
                    required: ["amount"],
                  },
                },
              },
            },
            responses: { "201": { description: "Created" } },
          },
        },
        "/api/vaults/{name}/withdraw": {
          post: {
            summary: "Withdraw from vault",
            parameters: [
              {
                name: "name",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      asset: { $ref: "#/components/schemas/Asset" },
                      amount: { type: "number" },
                      at: { type: "string" },
                      account: { type: "string" },
                      note: { type: "string" },
                      affect_account: { type: "boolean" },
                    },
                    required: ["amount"],
                  },
                },
              },
            },
            responses: { "201": { description: "Created" } },
          },
        },
      },
    },
  },
};
