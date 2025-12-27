import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

import { router as apiRouter } from "./routes";
import { reportsRouter } from "./reports";
import { actionsRouter } from "./actions";
import { pricesRouter } from "./prices";
import { openapiSpec } from "./openapi";
import { vaultsRouter } from "./vaults";
import { consVaultsRouter } from "./consVaults";
import { adminRouter } from "./admin";
import { loansRouter } from "./loans";
import { store } from "./store";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", apiRouter);
app.use("/api", reportsRouter);
app.use("/api", actionsRouter);
app.use("/api", pricesRouter);
app.use("/api", vaultsRouter);
app.use("/api", consVaultsRouter);
app.use("/api", adminRouter);
app.use("/api", loansRouter);

// OpenAPI/Swagger
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));
app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, { explorer: true })
);

async function bootstrap() {
  try {
    // Ensure default spending vault exists at startup
    store.getDefaultSpendingVaultName();
    // await store.migrateToVaultOnly();
    await store.accrueBorrowingInterestIfDue();
    console.log('Migration/accrual complete.');
  } catch (e) {
    const msg = (e as { message?: string } | null)?.message ?? String(e);
    console.error('Bootstrap failed:', msg);
  }
}

const PORT = process.env.PORT || 8080;
bootstrap().finally(() => {
  app.listen(PORT, () => {
    console.log(`Portfolio backend listening on http://localhost:${PORT}`);
    console.log(`Swagger UI at http://localhost:${PORT}/api/docs`);
  });
});
