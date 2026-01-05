import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI methods
extendZodWithOpenApi(z);

// Create the registry
export const registry = new OpenAPIRegistry();

// Re-export schemas with OpenAPI metadata
import {
  AssetSchema,
  InitialRequestSchema,
  IncomeExpenseSchema,
  BorrowLoanSchema,
  RepaySchema,
  LoanCreateSchema,
  LoanCreateBatchSchema,
} from "./types";

// Register schemas with OpenAPI metadata
export const AssetSchemaOpenAPI = registry.register(
  "Asset",
  AssetSchema.openapi({
    description: "Represents a crypto or fiat asset",
    example: { type: "CRYPTO", symbol: "BTC" },
  }),
);

export const RateSchemaOpenAPI = registry.register(
  "Rate",
  z
    .object({
      asset: AssetSchema,
      rateUSD: z.number().openapi({ example: 42000 }),
      timestamp: z.string().datetime(),
      source: z.enum([
        "COINGECKO",
        "EXCHANGE_RATE_HOST",
        "FRANKFURTER",
        "ER_API",
        "FALLBACK",
        "FIXED",
      ]),
    })
    .openapi({
      description: "Exchange rate information for an asset",
    }),
);

export const TransactionSchemaOpenAPI = registry.register(
  "Transaction",
  z
    .object({
      id: z.string().uuid(),
      type: z.enum([
        "INITIAL",
        "INCOME",
        "EXPENSE",
        "BORROW",
        "LOAN",
        "REPAY",
        "TRANSFER_OUT",
        "TRANSFER_IN",
      ]),
      asset: AssetSchema,
      amount: z.number(),
      createdAt: z.string().datetime(),
      account: z.string().optional(),
      note: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      counterparty: z.string().optional(),
      dueDate: z.string().datetime().optional(),
      transferId: z.string().optional(),
      loanId: z.string().optional(),
      sourceRef: z.string().optional(),
      rate: RateSchemaOpenAPI,
      usdAmount: z.number(),
      direction: z.enum(["BORROW", "LOAN"]).optional(),
    })
    .openapi({
      description: "A financial transaction",
      example: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        type: "INCOME",
        asset: { type: "FIAT", symbol: "USD" },
        amount: 1000,
        createdAt: "2025-12-31T12:00:00Z",
        account: "Bank Account",
        note: "Salary",
        rate: {
          asset: { type: "FIAT", symbol: "USD" },
          rateUSD: 1,
          timestamp: "2025-12-31T12:00:00Z",
          source: "FIXED",
        },
        usdAmount: 1000,
      },
    }),
);

export const InitialRequestSchemaOpenAPI = registry.register(
  "InitialRequest",
  InitialRequestSchema.openapi({
    description: "Request to create initial holdings",
  }),
);

export const IncomeExpenseSchemaOpenAPI = registry.register(
  "IncomeExpenseRequest",
  IncomeExpenseSchema.openapi({
    description: "Request to create income or expense transaction",
  }),
);

export const BorrowLoanSchemaOpenAPI = registry.register(
  "BorrowLoanRequest",
  BorrowLoanSchema.openapi({
    description: "Request to create borrow or loan transaction",
  }),
);

export const RepaySchemaOpenAPI = registry.register(
  "RepayRequest",
  RepaySchema.openapi({
    description: "Request to create repayment transaction",
  }),
);

export const HoldingsRowSchemaOpenAPI = registry.register(
  "HoldingsRow",
  z
    .object({
      asset: z.string(),
      account: z.string().optional(),
      quantity: z.number(),
      value_usd: z.number(),
      value_vnd: z.number(),
      percentage: z.number(),
      last_updated: z.string().datetime(),
    })
    .openapi({
      description: "Holdings by asset and account",
    }),
);

export const HoldingsSummarySchemaOpenAPI = registry.register(
  "HoldingsSummary",
  z
    .object({
      by_asset: z.record(
        z.object({
          quantity: z.number(),
          value_usd: z.number(),
          value_vnd: z.number(),
          percentage: z.number(),
        }),
      ),
      total_value_usd: z.number(),
      total_value_vnd: z.number(),
      last_updated: z.string().datetime(),
    })
    .openapi({
      description: "Summary of all holdings",
    }),
);

export const VaultSchemaOpenAPI = registry.register(
  "Vault",
  z
    .object({
      name: z.string(),
      status: z.enum(["ACTIVE", "CLOSED"]),
      createdAt: z.string().datetime(),
    })
    .openapi({
      description: "A vault for organizing funds",
    }),
);

export const VaultEntrySchemaOpenAPI = registry.register(
  "VaultEntry",
  z
    .object({
      vault: z.string(),
      type: z.enum(["DEPOSIT", "WITHDRAW", "VALUATION"]),
      asset: AssetSchema,
      amount: z.number(),
      usdValue: z.number(),
      at: z.string().datetime(),
      account: z.string().optional(),
      note: z.string().optional(),
    })
    .openapi({
      description: "A vault deposit or withdrawal",
    }),
);

export const LoanAgreementSchemaOpenAPI = registry.register(
  "LoanAgreement",
  z
    .object({
      id: z.string().uuid(),
      counterparty: z.string(),
      asset: AssetSchema,
      principal: z.number(),
      interestRate: z.number(),
      period: z.enum(["DAY", "MONTH", "YEAR"]),
      startAt: z.string().datetime(),
      maturityAt: z.string().datetime().optional(),
      note: z.string().optional(),
      account: z.string().optional(),
      status: z.enum(["ACTIVE", "CLOSED"]),
      createdAt: z.string().datetime(),
    })
    .openapi({
      description: "A loan agreement",
    }),
);

export const LoanCreateSchemaOpenAPI = registry.register(
  "LoanCreateRequest",
  LoanCreateSchema.openapi({
    description: "Request to create a loan agreement",
  }),
);

export const LoanCreateBatchSchemaOpenAPI = registry.register(
  "LoanCreateBatchRequest",
  LoanCreateBatchSchema.openapi({
    description: "Request to create multiple loan agreements",
  }),
);

// Export/Import schemas
export const TypeSchemaOpenAPI = registry.register(
  "Type",
  z
    .object({
      id: z.number(),
      name: z.string(),
      description: z.string().nullable(),
      is_active: z.boolean().optional(),
    })
    .openapi({
      description: "Transaction type",
    }),
);

export const AccountSchemaOpenAPI = registry.register(
  "Account",
  z
    .object({
      id: z.number(),
      name: z.string(),
      type: z.string().nullable(),
      is_active: z.boolean().optional(),
    })
    .openapi({
      description: "Account",
    }),
);

export const TagSchemaOpenAPI = registry.register(
  "Tag",
  z
    .object({
      id: z.number(),
      name: z.string(),
      category: z.string().nullable(),
      is_active: z.boolean().optional(),
    })
    .openapi({
      description: "Tag",
    }),
);

export const PendingActionSchemaOpenAPI = registry.register(
  "PendingAction",
  z
    .object({
      id: z.string(),
      source: z.string(),
      raw_input: z.string(),
      toon_text: z.string().nullable(),
      action_json: z.any().nullable(),
      confidence: z.number().optional(),
      batch_id: z.string().optional(),
      meta: z.any().optional(),
      status: z.enum(["pending", "accepted", "rejected"]),
      created_at: z.string(),
      updated_at: z.string(),
      error: z.string().nullable().optional(),
      created_tx_ids: z.array(z.string()).optional(),
    })
    .openapi({
      description: "AI pending action",
    }),
);

export const BorrowingSettingsSchemaOpenAPI = registry.register(
  "BorrowingSettings",
  z
    .object({
      name: z.string(),
      rate: z.number(),
      lastAccrualStart: z.string().optional(),
    })
    .openapi({
      description: "Borrowing settings",
    }),
);

export const ExportDataSchemaOpenAPI = registry.register(
  "ExportData",
  z
    .object({
      version: z.number(),
      exported_at: z.string().datetime(),
      transactions: z.array(TransactionSchemaOpenAPI),
      vaults: z.array(
        z.object({
          name: z.string(),
          status: z.enum(["ACTIVE", "CLOSED"]),
          createdAt: z.string().datetime(),
          entries: z.array(VaultEntrySchemaOpenAPI),
        }),
      ),
      loans: z.array(LoanAgreementSchemaOpenAPI),
      types: z.array(TypeSchemaOpenAPI),
      accounts: z.array(AccountSchemaOpenAPI),
      assets: z
        .array(
          z.object({
            id: z.number(),
            symbol: z.string(),
            name: z.string().nullable(),
            decimals: z.number().optional(),
            is_active: z.boolean().optional(),
          }),
        )
        .optional(),
      tags: z.array(TagSchemaOpenAPI),
      pending_actions: z.array(PendingActionSchemaOpenAPI),
      settings: z
        .object({
          default_spending_vault: z.string(),
          default_income_vault: z.string(),
          borrowing: BorrowingSettingsSchemaOpenAPI,
        })
        .optional(),
    })
    .openapi({
      description: "Complete export of all application data",
    }),
);

export const ImportRequestSchemaOpenAPI = registry.register(
  "ImportRequest",
  ExportDataSchemaOpenAPI.omit({ version: true, exported_at: true }).openapi({
    description: "Request to import data",
  }),
);

export const ImportResponseSchemaOpenAPI = registry.register(
  "ImportResponse",
  z
    .object({
      ok: z.boolean(),
      imported: z.object({
        transactions: z.number(),
        vaults: z.number(),
        vault_entries: z.number(),
        loans: z.number(),
        types: z.number(),
        accounts: z.number(),
        assets: z.number(),
        tags: z.number(),
        pending_actions: z.number(),
      }),
    })
    .openapi({
      description: "Response after importing data",
    }),
);

// Register security scheme
registry.registerComponent("securitySchemes", "basicAuth", {
  type: "http",
  scheme: "basic",
  description: "Basic authentication using username and password from environment variables (BASIC_AUTH_USERNAME, BASIC_AUTH_PASSWORD). Only enabled when BASIC_AUTH_ENABLED=true.",
});

// Register routes
export function registerRoutes() {
  // Health endpoints
  registry.registerPath({
    method: "get",
    path: "/health",
    summary: "Health check",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              timestamp: z.string(),
              uptime: z.number(),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/health",
    summary: "Health check (API)",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.object({ ok: z.boolean() }),
          },
        },
      },
    },
  });

  // Transaction endpoints
  registry.registerPath({
    method: "get",
    path: "/api/transactions",
    summary: "List all transactions",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.array(TransactionSchemaOpenAPI),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/transactions/{id}",
    summary: "Delete a transaction by ID",
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
    },
    responses: {
      204: { description: "Deleted" },
      404: { description: "Not found" },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/transactions/initial",
    summary: "Create initial holdings",
    request: {
      body: {
        content: {
          "application/json": {
            schema: InitialRequestSchemaOpenAPI,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: z.object({
              created: z.number(),
              transactions: z.array(TransactionSchemaOpenAPI),
            }),
          },
        },
      },
      400: { description: "Bad request" },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/transactions/income",
    summary: "Create income transaction",
    request: {
      body: {
        content: {
          "application/json": {
            schema: IncomeExpenseSchemaOpenAPI,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: TransactionSchemaOpenAPI,
          },
        },
      },
      400: { description: "Bad request" },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/transactions/expense",
    summary: "Create expense transaction",
    request: {
      body: {
        content: {
          "application/json": {
            schema: IncomeExpenseSchemaOpenAPI,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: TransactionSchemaOpenAPI,
          },
        },
      },
      400: { description: "Bad request" },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/transactions/borrow",
    summary: "Create borrow transaction (liability)",
    request: {
      body: {
        content: {
          "application/json": {
            schema: BorrowLoanSchemaOpenAPI,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: TransactionSchemaOpenAPI,
          },
        },
      },
      400: { description: "Bad request" },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/transactions/loan",
    summary: "Create loan transaction (receivable)",
    request: {
      body: {
        content: {
          "application/json": {
            schema: BorrowLoanSchemaOpenAPI,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: TransactionSchemaOpenAPI,
          },
        },
      },
      400: { description: "Bad request" },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/transactions/repay",
    summary: "Create repayment transaction",
    request: {
      body: {
        content: {
          "application/json": {
            schema: RepaySchemaOpenAPI,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: TransactionSchemaOpenAPI,
          },
        },
      },
      400: { description: "Bad request" },
    },
  });

  // Reports endpoints
  registry.registerPath({
    method: "get",
    path: "/api/reports/holdings",
    summary: "Get portfolio holdings by asset and account",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.array(HoldingsRowSchemaOpenAPI),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/reports/holdings/summary",
    summary: "Get holdings summary",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: HoldingsSummarySchemaOpenAPI,
          },
        },
      },
    },
  });

  // Vaults endpoints
  registry.registerPath({
    method: "get",
    path: "/api/vaults",
    summary: "List vaults",
    request: {
      query: z.object({
        is_open: z.boolean().optional(),
        enrich: z.boolean().optional(),
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.array(VaultSchemaOpenAPI),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/vaults",
    summary: "Create vault",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: VaultSchemaOpenAPI,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/vaults/{name}",
    summary: "Get vault by name",
    request: {
      params: z.object({
        name: z.string(),
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: VaultSchemaOpenAPI,
          },
        },
      },
      404: { description: "Not found" },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/vaults/{name}/transactions",
    summary: "List vault entries",
    request: {
      params: z.object({
        name: z.string(),
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z.array(VaultEntrySchemaOpenAPI),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/vaults/{name}/deposit",
    summary: "Deposit to vault",
    request: {
      params: z.object({
        name: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              asset: AssetSchema,
              amount: z.number().positive(),
              at: z.string().datetime().optional(),
              account: z.string().optional(),
              note: z.string().optional(),
              affect_account: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: "Created" },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/vaults/{name}/withdraw",
    summary: "Withdraw from vault",
    request: {
      params: z.object({
        name: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              asset: AssetSchema,
              amount: z.number().positive(),
              at: z.string().datetime().optional(),
              account: z.string().optional(),
              note: z.string().optional(),
              affect_account: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: "Created" },
    },
  });

  // Admin - Export/Import endpoints
  registry.registerPath({
    method: "get",
    path: "/api/admin/export",
    summary: "Export all data",
    description:
      "Export all application data including transactions, vaults, loans, types, accounts, assets, tags, pending actions, and settings. Returns a downloadable JSON file.",
    security: [{ basicAuth: [] }],
    responses: {
      200: {
        description: "OK - Returns JSON file for download",
        content: {
          "application/json": {
            schema: ExportDataSchemaOpenAPI,
          },
        },
      },
      401: { description: "Unauthorized - Invalid or missing credentials" },
      500: { description: "Internal server error" },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/admin/import",
    summary: "Import data",
    description:
      "Import application data including transactions, vaults, loans, types, accounts, assets, tags, pending actions, and settings",
    security: [{ basicAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: ImportRequestSchemaOpenAPI,
          },
        },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: ImportResponseSchemaOpenAPI,
          },
        },
      },
      400: { description: "Bad request" },
      401: { description: "Unauthorized - Invalid or missing credentials" },
      500: { description: "Internal server error" },
    },
  });
}

// Generate the OpenAPI document
export function generateOpenAPIDocument() {
  // Register all routes
  registerRoutes();

  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Nami Portfolio API",
      version: "1.0.0",
      description:
        "Transaction-based portfolio backend with accounts, vaults, reporting, and pricing.",
    },
    servers: [
      {
        url: "/",
        description: "Current server (uses relative path)",
      },
    ],
  });
}
