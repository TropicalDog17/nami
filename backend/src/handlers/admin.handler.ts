import { Router, Request, Response } from "express";
import {
  adminRepository,
  pendingActionsRepository,
  settingsRepository,
} from "../repositories";
import { vaultService } from "../services/vault.service";
import { transactionService } from "../services/transaction.service";
import { Asset } from "../types";

export const adminRouter = Router();

// Settings: Default Vaults
adminRouter.get("/admin/settings", (_req: Request, res: Response) => {
  try {
    const spending = settingsRepository.getDefaultSpendingVaultName();
    const income = settingsRepository.getDefaultIncomeVaultName();
    const borrow = settingsRepository.getBorrowingSettings();
    res.json({
      default_spending_vault: spending,
      default_income_vault: income,
      borrowing_vault: borrow.name,
      borrowing_monthly_rate: borrow.rate,
      borrowing_last_accrual_at: borrow.lastAccrualStart,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to read settings" });
  }
});

adminRouter.post(
  "/admin/settings/spending-vault",
  (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      settingsRepository.setDefaultSpendingVaultName(name);
      vaultService.ensureVault(name);

      res.status(200).json({ default_spending_vault: name });
    } catch (e: any) {
      res
        .status(400)
        .json({ error: e?.message || "failed to set spending vault" });
    }
  },
);

adminRouter.post(
  "/admin/settings/income-vault",
  (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      settingsRepository.setDefaultIncomeVaultName(name);
      vaultService.ensureVault(name);

      res.status(200).json({ default_income_vault: name });
    } catch (e: any) {
      res
        .status(400)
        .json({ error: e?.message || "failed to set income vault" });
    }
  },
);

// Transaction Types
adminRouter.get("/admin/types", (_req: Request, res: Response) => {
  res.json(adminRepository.findAllTypes());
});

adminRouter.get("/admin/types/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = adminRepository.findTypeById(id);
  if (!item) return res.status(404).json({ error: "Type not found" });
  res.json(item);
});

adminRouter.post("/admin/types", (req: Request, res: Response) => {
  try {
    const { name, description, is_active } = req.body || {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }
    const created = adminRepository.createType({
      name,
      description,
      is_active,
    });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Failed to create type" });
  }
});

adminRouter.put("/admin/types/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = adminRepository.updateType(id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Type not found" });
  res.json(updated);
});

adminRouter.delete("/admin/types/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = adminRepository.deleteType(id);
  if (!ok) return res.status(404).json({ error: "Type not found" });
  res.json({ deleted: 1 });
});

// Accounts
adminRouter.get("/admin/accounts", (_req: Request, res: Response) => {
  res.json(adminRepository.findAllAccounts());
});

adminRouter.get("/admin/accounts/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = adminRepository.findAccountById(id);
  if (!item) return res.status(404).json({ error: "Account not found" });
  res.json(item);
});

adminRouter.post("/admin/accounts", (req: Request, res: Response) => {
  try {
    const { name, type, is_active } = req.body || {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }
    const created = adminRepository.createAccount({ name, type, is_active });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Failed to create account" });
  }
});

adminRouter.put("/admin/accounts/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = adminRepository.updateAccount(id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Account not found" });
  res.json(updated);
});

adminRouter.delete("/admin/accounts/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = adminRepository.deleteAccount(id);
  if (!ok) return res.status(404).json({ error: "Account not found" });
  res.json({ deleted: 1 });
});

// Assets
adminRouter.get("/admin/assets", (_req: Request, res: Response) => {
  res.json(adminRepository.findAllAssets());
});

adminRouter.get("/admin/assets/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = adminRepository.findAssetById(id);
  if (!item) return res.status(404).json({ error: "Asset not found" });
  res.json(item);
});

adminRouter.post("/admin/assets", (req: Request, res: Response) => {
  try {
    const { symbol, name, decimals, is_active } = req.body || {};
    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "symbol is required" });
    }
    const created = adminRepository.createAsset({
      symbol,
      name,
      decimals,
      is_active,
    });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Failed to create asset" });
  }
});

adminRouter.put("/admin/assets/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = adminRepository.updateAsset(id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Asset not found" });
  res.json(updated);
});

adminRouter.delete("/admin/assets/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = adminRepository.deleteAsset(id);
  if (!ok) return res.status(404).json({ error: "Asset not found" });
  res.json({ deleted: 1 });
});

// Tags
adminRouter.get("/admin/tags", (_req: Request, res: Response) => {
  res.json(adminRepository.findAllTags());
});

adminRouter.get("/admin/tags/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = adminRepository.findTagById(id);
  if (!item) return res.status(404).json({ error: "Tag not found" });
  res.json(item);
});

adminRouter.post("/admin/tags", (req: Request, res: Response) => {
  try {
    const { name, category, is_active } = req.body || {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }
    const created = adminRepository.createTag({ name, category, is_active });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Failed to create tag" });
  }
});

adminRouter.put("/admin/tags/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = adminRepository.updateTag(id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Tag not found" });
  res.json(updated);
});

adminRouter.delete("/admin/tags/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = adminRepository.deleteTag(id);
  if (!ok) return res.status(404).json({ error: "Tag not found" });
  res.json({ deleted: 1 });
});

// AI Pending Actions
adminRouter.get("/admin/pending-actions", (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const result = status
    ? pendingActionsRepository.findByStatus(status)
    : pendingActionsRepository.findAll();
  res.json(result);
});

// Bulk operations MUST come before :id routes (Express route order matters)
adminRouter.post(
  "/admin/pending-actions/reject-all",
  (req: Request, res: Response) => {
    const batchId = req.query.batch_id as string | undefined;
    const pendingActions = pendingActionsRepository.findByStatus("pending");
    const toReject = batchId
      ? pendingActions.filter(
          (p: { batch_id?: string }) => p.batch_id === batchId,
        )
      : pendingActions;
    let count = 0;
    for (const action of toReject) {
      const updated = pendingActionsRepository.update(action.id, {
        status: "rejected",
      });
      if (updated) count++;
    }
    res.json({ ok: true, rejected: count });
  },
);

adminRouter.post(
  "/admin/pending-actions/accept-all",
  async (req: Request, res: Response) => {
    const batchId = req.query.batch_id as string | undefined;

    // Get all pending actions to process
    const allPending = pendingActionsRepository.findByStatus("pending");
    const toProcess = batchId
      ? allPending.filter((p: { batch_id?: string }) => p.batch_id === batchId)
      : allPending;

    let acceptedCount = 0;
    let skippedCount = 0;

    for (const pending of toProcess) {
      try {
        const actionJson = pending.action_json;
        if (actionJson && typeof actionJson === "object") {
          const { action, params } = actionJson as {
            action?: string;
            params?: any;
          };

          if (action && params) {
            const asset: Asset = { type: "FIAT", symbol: "VND" };
            let tx;

            switch (action) {
              case "spend_vnd":
                vaultService.ensureVault(
                  params.account ||
                    settingsRepository.getDefaultSpendingVaultName(),
                );
                tx = await transactionService.createExpenseTransaction({
                  asset,
                  amount: params.vnd_amount,
                  at: params.date,
                  account: params.account,
                  note: params.note,
                  category: params.tag,
                  counterparty: params.counterparty,
                });
                pendingActionsRepository.update(pending.id, {
                  status: "accepted",
                  created_tx_ids: [tx.id],
                });
                acceptedCount++;
                break;

              case "income_vnd":
                vaultService.ensureVault(
                  params.account ||
                    settingsRepository.getDefaultIncomeVaultName(),
                );
                tx = await transactionService.createIncomeTransaction({
                  asset,
                  amount: params.vnd_amount,
                  at: params.date,
                  account: params.account,
                  note: params.note,
                  category: params.tag,
                  counterparty: params.counterparty,
                });
                pendingActionsRepository.update(pending.id, {
                  status: "accepted",
                  created_tx_ids: [tx.id],
                });
                acceptedCount++;
                break;

              case "credit_spend_vnd":
                vaultService.ensureVault(
                  params.account ||
                    settingsRepository.getDefaultSpendingVaultName(),
                );
                tx = await transactionService.createExpenseTransaction({
                  asset,
                  amount: params.vnd_amount,
                  at: params.date,
                  account: params.account,
                  note: params.note
                    ? `[Credit] ${params.note}`
                    : "[Credit Card Expense]",
                  category: params.tag,
                  counterparty: params.counterparty,
                });
                pendingActionsRepository.update(pending.id, {
                  status: "accepted",
                  created_tx_ids: [tx.id],
                });
                acceptedCount++;
                break;

              case "card_payment_vnd":
                const spendingAccount =
                  params.from_account ||
                  settingsRepository.getDefaultSpendingVaultName();
                vaultService.ensureVault(spendingAccount);
                tx = await transactionService.createExpenseTransaction({
                  asset,
                  amount: params.vnd_amount,
                  at: params.date,
                  account: spendingAccount,
                  note: params.note || "Credit card payment",
                  category: "card_payment",
                });
                pendingActionsRepository.update(pending.id, {
                  status: "accepted",
                  created_tx_ids: [tx.id],
                });
                acceptedCount++;
                break;

              default:
                pendingActionsRepository.update(pending.id, {
                  status: "accepted",
                  error: `Unknown action type: ${action}`,
                });
                skippedCount++;
            }
          } else {
            pendingActionsRepository.update(pending.id, {
              status: "accepted",
              error: "Invalid action_json: missing action or params",
            });
            skippedCount++;
          }
        } else {
          pendingActionsRepository.update(pending.id, {
            status: "accepted",
            error: "No action_json found",
          });
          skippedCount++;
        }
      } catch (e: any) {
        pendingActionsRepository.update(pending.id, {
          status: "accepted",
          error: e?.message || "Failed to create transaction",
        });
        skippedCount++;
      }
    }

    res.json({ ok: true, accepted: acceptedCount, skipped: skippedCount });
  },
);

adminRouter.delete("/admin/pending-actions", (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const batchId = req.query.batch_id as string | undefined;

  if (!status) {
    return res
      .status(400)
      .json({
        error: "status query param required (pending|accepted|rejected)",
      });
  }

  const toDelete = pendingActionsRepository.findByStatus(status);
  const filtered = batchId
    ? toDelete.filter((p: { batch_id?: string }) => p.batch_id === batchId)
    : toDelete;
  let count = 0;
  for (const action of filtered) {
    if (pendingActionsRepository.delete(action.id)) count++;
  }
  res.json({ ok: true, deleted: count });
});

// Single item routes
adminRouter.get("/admin/pending-actions/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const item = pendingActionsRepository.findById(id);
  if (!item) return res.status(404).json({ error: "Pending action not found" });
  res.json(item);
});

adminRouter.post("/admin/pending-actions", (req: Request, res: Response) => {
  try {
    const {
      source,
      raw_input,
      toon_text,
      action_json,
      confidence,
      batch_id,
      meta,
    } = req.body || {};
    if (!source || typeof source !== "string") {
      return res.status(400).json({ error: "source is required" });
    }
    if (!raw_input || typeof raw_input !== "string") {
      return res.status(400).json({ error: "raw_input is required" });
    }
    const created = pendingActionsRepository.create({
      source: source as any,
      raw_input,
      toon_text,
      action_json,
      confidence,
      batch_id,
      meta,
      status: "pending",
      id: "",
      created_at: "",
      updated_at: "",
      error: undefined,
      created_tx_ids: undefined,
    });
    res.status(201).json(created);
  } catch (e: any) {
    res
      .status(400)
      .json({ error: e?.message || "Failed to create pending action" });
  }
});

adminRouter.post(
  "/admin/pending-actions/:id/accept",
  async (req: Request, res: Response) => {
    const id = String(req.params.id);

    // Get the pending action
    const pending = pendingActionsRepository.findById(id);
    if (!pending)
      return res.status(404).json({ error: "Pending action not found" });
    if (pending.status !== "pending") {
      return res
        .status(400)
        .json({ error: "Only pending actions can be accepted" });
    }

    // Parse action_json to determine what transaction to create
    let createdTxIds: string[] = [];
    let error: string | null = null;

    try {
      const actionJson = pending.action_json;
      if (actionJson && typeof actionJson === "object") {
        const { action, params } = actionJson as {
          action?: string;
          params?: any;
        };

        if (action && params) {
          const asset: Asset = { type: "FIAT", symbol: "VND" };
          let tx;

          switch (action) {
            case "spend_vnd":
              // Expense from spending vault
              vaultService.ensureVault(
                params.account ||
                  settingsRepository.getDefaultSpendingVaultName(),
              );
              tx = await transactionService.createExpenseTransaction({
                asset,
                amount: params.vnd_amount,
                at: params.date,
                account: params.account,
                note: params.note,
                category: params.tag,
                counterparty: params.counterparty,
              });
              createdTxIds.push(tx.id);
              break;

            case "income_vnd":
              // Income to income vault
              vaultService.ensureVault(
                params.account ||
                  settingsRepository.getDefaultIncomeVaultName(),
              );
              tx = await transactionService.createIncomeTransaction({
                asset,
                amount: params.vnd_amount,
                at: params.date,
                account: params.account,
                note: params.note,
                category: params.tag,
                counterparty: params.counterparty,
              });
              createdTxIds.push(tx.id);
              break;

            case "credit_spend_vnd":
              // Credit card expense (from credit account)
              vaultService.ensureVault(
                params.account ||
                  settingsRepository.getDefaultSpendingVaultName(),
              );
              tx = await transactionService.createExpenseTransaction({
                asset,
                amount: params.vnd_amount,
                at: params.date,
                account: params.account,
                note: params.note
                  ? `[Credit] ${params.note}`
                  : "[Credit Card Expense]",
                category: params.tag,
                counterparty: params.counterparty,
              });
              createdTxIds.push(tx.id);
              break;

            case "card_payment_vnd":
              // Payment to credit card (expense from spending)
              const spendingAccount =
                params.from_account ||
                settingsRepository.getDefaultSpendingVaultName();
              vaultService.ensureVault(spendingAccount);
              tx = await transactionService.createExpenseTransaction({
                asset,
                amount: params.vnd_amount,
                at: params.date,
                account: spendingAccount,
                note: params.note || "Credit card payment",
                category: "card_payment",
              });
              createdTxIds.push(tx.id);
              break;

            default:
              error = `Unknown action type: ${action}`;
          }
        } else {
          error = "Invalid action_json: missing action or params";
        }
      } else {
        error = "No action_json found";
      }
    } catch (e: any) {
      error = e?.message || "Failed to create transaction";
    }

    // Update the pending action with status and created transaction IDs
    const updated = pendingActionsRepository.update(id, {
      status: error ? "accepted" : "accepted", // Keep accepted even if error, for review
      created_tx_ids: createdTxIds.length > 0 ? createdTxIds : undefined,
      error,
    });

    if (!updated)
      return res.status(404).json({ error: "Pending action not found" });
    res.json({ ok: true, item: updated });
  },
);

adminRouter.post(
  "/admin/pending-actions/:id/reject",
  (req: Request, res: Response) => {
    const id = String(req.params.id);
    const updated = pendingActionsRepository.update(id, { status: "rejected" });
    if (!updated)
      return res.status(404).json({ error: "Pending action not found" });
    res.json({ ok: true, item: updated });
  },
);

adminRouter.delete(
  "/admin/pending-actions/:id",
  (req: Request, res: Response) => {
    const id = String(req.params.id);
    const ok = pendingActionsRepository.delete(id);
    if (!ok) return res.status(404).json({ error: "Pending action not found" });
    res.json({ deleted: 1 });
  },
);
