import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

import { transactionsRouter } from "./handlers/transaction.handler";
import { reportsRouter } from "./handlers/reports.handler";
import { actionsRouter } from "./handlers/actions.handler";
import { pricesRouter } from "./handlers/prices.handler";
import { openapiSpec } from "./openapi";
import { vaultsRouter } from "./handlers/vault.handler";
import { consVaultsRouter } from "./handlers/cons-vaults.handler";
import { adminRouter } from "./handlers/admin.handler";
import { loansRouter } from "./handlers/loan.handler";
import { aiRouter } from "./handlers/ai.handler";
import { settingsRepository } from "./repositories";
import { vaultService } from "./services/vault.service";
import { initializeDatabase, closeConnection } from "./database/connection";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", transactionsRouter);
app.use("/api", reportsRouter);
app.use("/api", actionsRouter);
app.use("/api", pricesRouter);
app.use("/api", vaultsRouter);
app.use("/api", consVaultsRouter);
app.use("/api", adminRouter);
app.use("/api", loansRouter);
app.use("/api", aiRouter);

// OpenAPI/Swagger
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, { explorer: true }),
);

async function bootstrap() {
  try {
    // Initialize database if using database backend
    if (process.env.STORAGE_BACKEND === "database") {
      initializeDatabase();
      console.log("Database initialized");
    }

    // Ensure default vaults exist at startup
    const defaultSpendingVault =
      settingsRepository.getDefaultSpendingVaultName();
    const defaultIncomeVault = settingsRepository.getDefaultIncomeVaultName();
    vaultService.ensureVault(defaultSpendingVault);
    vaultService.ensureVault(defaultIncomeVault);

    // Initialize borrowing settings
    settingsRepository.getBorrowingSettings();

    console.log("Initialization complete.");
    console.log(`Default spending vault: ${defaultSpendingVault}`);
    console.log(`Default income vault: ${defaultIncomeVault}`);
  } catch (e) {
    const msg = (e as { message?: string } | null)?.message ?? String(e);
    console.error("Bootstrap failed:", msg);
  }
}

const PORT = process.env.PORT || 8080;
bootstrap().finally(() => {
  app.listen(PORT, () => {
    console.log(`Portfolio backend listening on http://localhost:${PORT}`);
    console.log(`Swagger UI at http://localhost:${PORT}/api/docs`);
  });
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  closeConnection();
  process.exit(0);
});
