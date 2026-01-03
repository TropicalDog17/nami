import crypto from "crypto";
import {
  AdminType,
  AdminAccount,
  AdminAsset,
  AdminTag,
  PendingAction,
  PendingSource,
  readStore,
  writeStore,
  nextId,
} from "./base.repository";
import {
  IAdminRepository,
  IPendingActionsRepository,
} from "./repository.interface";
import { BaseDbRepository } from "./base-db.repository";

const DEFAULT_TRANSACTION_TYPES: Array<
  Pick<AdminType, "name" | "description">
> = [
  {
    name: "INITIAL",
    description: "Starting balance entries for assets/accounts",
  },
  { name: "INCOME", description: "Incoming funds (salary, sales, deposits)" },
  {
    name: "EXPENSE",
    description: "Outgoing funds (purchases, fees, withdrawals)",
  },
  { name: "BORROW", description: "Borrowed funds creating a liability" },
  { name: "LOAN", description: "Lent funds creating a receivable" },
  { name: "REPAY", description: "Repayment against a borrow/loan" },
  { name: "TRANSFER_OUT", description: "Transfer out from an account" },
  { name: "TRANSFER_IN", description: "Transfer in to an account" },
];

const DEFAULT_ADMIN_ASSETS: Array<
  Pick<AdminAsset, "symbol" | "name" | "decimals">
> = [
  { symbol: "BTC", name: "Bitcoin", decimals: 8 },
  { symbol: "ETH", name: "Ethereum", decimals: 18 },
  { symbol: "USDT", name: "Tether USD", decimals: 6 },
  { symbol: "VND", name: "Vietnamese Dong", decimals: 0 },
];

// JSON-based implementation
export class AdminRepositoryJson implements IAdminRepository {
  // Transaction Types
  findAllTypes(): AdminType[] {
    this.seedDefaultTypesIfEmpty();
    return readStore().adminTypes;
  }

  findTypeById(id: number): AdminType | undefined {
    return readStore().adminTypes.find((t) => t.id === id);
  }

  createType(data: Partial<AdminType> & { name: string }): AdminType {
    const store = readStore();
    const item: AdminType = {
      id: nextId(store.adminTypes),
      name: data.name,
      description: data.description ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    store.adminTypes.push(item);
    writeStore(store);
    return item;
  }

  updateType(id: number, data: Partial<AdminType>): AdminType | undefined {
    const store = readStore();
    const index = store.adminTypes.findIndex((t) => t.id === id);
    if (index === -1) return undefined;

    const prev = store.adminTypes[index];
    store.adminTypes[index] = {
      ...prev,
      ...data,
      id: prev.id,
      created_at: prev.created_at,
    };
    writeStore(store);
    return store.adminTypes[index];
  }

  deleteType(id: number): boolean {
    const store = readStore();
    const initialLength = store.adminTypes.length;
    store.adminTypes = store.adminTypes.filter((t) => t.id !== id);
    writeStore(store);
    return store.adminTypes.length < initialLength;
  }

  // Accounts
  findAllAccounts(): AdminAccount[] {
    return readStore().adminAccounts;
  }

  findAccountById(id: number): AdminAccount | undefined {
    return readStore().adminAccounts.find((a) => a.id === id);
  }

  createAccount(data: Partial<AdminAccount> & { name: string }): AdminAccount {
    const store = readStore();
    const item: AdminAccount = {
      id: nextId(store.adminAccounts),
      name: data.name,
      type: data.type ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    store.adminAccounts.push(item);
    writeStore(store);
    return item;
  }

  updateAccount(
    id: number,
    data: Partial<AdminAccount>,
  ): AdminAccount | undefined {
    const store = readStore();
    const index = store.adminAccounts.findIndex((a) => a.id === id);
    if (index === -1) return undefined;

    const prev = store.adminAccounts[index];
    store.adminAccounts[index] = {
      ...prev,
      ...data,
      id: prev.id,
      created_at: prev.created_at,
    };
    writeStore(store);
    return store.adminAccounts[index];
  }

  deleteAccount(id: number): boolean {
    const store = readStore();
    const initialLength = store.adminAccounts.length;
    store.adminAccounts = store.adminAccounts.filter((a) => a.id !== id);
    writeStore(store);
    return store.adminAccounts.length < initialLength;
  }

  // Assets
  findAllAssets(): AdminAsset[] {
    this.seedDefaultAssetsIfEmpty();
    return readStore().adminAssets;
  }

  findAssetById(id: number): AdminAsset | undefined {
    return readStore().adminAssets.find((a) => a.id === id);
  }

  createAsset(data: Partial<AdminAsset> & { symbol: string }): AdminAsset {
    const store = readStore();
    const item: AdminAsset = {
      id: nextId(store.adminAssets),
      symbol: data.symbol.toUpperCase(),
      name: data.name ?? "",
      decimals: typeof data.decimals === "number" ? data.decimals : 8,
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    store.adminAssets.push(item);
    writeStore(store);
    return item;
  }

  updateAsset(id: number, data: Partial<AdminAsset>): AdminAsset | undefined {
    const store = readStore();
    const index = store.adminAssets.findIndex((a) => a.id === id);
    if (index === -1) return undefined;

    const prev = store.adminAssets[index];
    const updated = {
      ...prev,
      ...data,
      id: prev.id,
      created_at: prev.created_at,
    };
    if (updated.symbol) updated.symbol = updated.symbol.toUpperCase();
    store.adminAssets[index] = updated;
    writeStore(store);
    return store.adminAssets[index];
  }

  deleteAsset(id: number): boolean {
    const store = readStore();
    const initialLength = store.adminAssets.length;
    store.adminAssets = store.adminAssets.filter((a) => a.id !== id);
    writeStore(store);
    return store.adminAssets.length < initialLength;
  }

  // Tags
  findAllTags(): AdminTag[] {
    return readStore().adminTags;
  }

  findTagById(id: number): AdminTag | undefined {
    return readStore().adminTags.find((t) => t.id === id);
  }

  createTag(data: Partial<AdminTag> & { name: string }): AdminTag {
    const store = readStore();
    const item: AdminTag = {
      id: nextId(store.adminTags),
      name: data.name,
      category: data.category ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    store.adminTags.push(item);
    writeStore(store);
    return item;
  }

  updateTag(id: number, data: Partial<AdminTag>): AdminTag | undefined {
    const store = readStore();
    const index = store.adminTags.findIndex((t) => t.id === id);
    if (index === -1) return undefined;

    const prev = store.adminTags[index];
    store.adminTags[index] = {
      ...prev,
      ...data,
      id: prev.id,
      created_at: prev.created_at,
    };
    writeStore(store);
    return store.adminTags[index];
  }

  deleteTag(id: number): boolean {
    const store = readStore();
    const initialLength = store.adminTags.length;
    store.adminTags = store.adminTags.filter((t) => t.id !== id);
    writeStore(store);
    return store.adminTags.length < initialLength;
  }

  // Seed methods
  private seedDefaultTypesIfEmpty(): void {
    const store = readStore();
    if ((store.adminTypes?.length ?? 0) > 0) return;

    const now = new Date().toISOString();
    store.adminTypes = DEFAULT_TRANSACTION_TYPES.map((t, idx) => ({
      id: idx + 1,
      name: t.name,
      description: t.description,
      is_active: true,
      created_at: now,
    }));
    writeStore(store);
  }

  private seedDefaultAssetsIfEmpty(): void {
    const store = readStore();
    if ((store.adminAssets?.length ?? 0) > 0) return;

    const now = new Date().toISOString();
    store.adminAssets = DEFAULT_ADMIN_ASSETS.map((a, idx) => ({
      id: idx + 1,
      symbol: a.symbol.toUpperCase(),
      name: a.name ?? "",
      decimals: typeof a.decimals === "number" ? a.decimals : 8,
      is_active: true,
      created_at: now,
    }));
    writeStore(store);
  }
}

// Database-based implementation
export class AdminRepositoryDb
  extends BaseDbRepository
  implements IAdminRepository
{
  private rowToType(row: any): AdminType {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      is_active: !!row.is_active,
      created_at: row.created_at,
    };
  }

  private rowToAccount(row: any): AdminAccount {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      is_active: !!row.is_active,
      created_at: row.created_at,
    };
  }

  private rowToAsset(row: any): AdminAsset {
    return {
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      decimals: row.decimals,
      is_active: !!row.is_active,
      created_at: row.created_at,
    };
  }

  private rowToTag(row: any): AdminTag {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      is_active: !!row.is_active,
      created_at: row.created_at,
    };
  }

  // Seed methods
  private seedDefaultTypesIfEmpty(): void {
    const existing = this.findMany(
      "SELECT * FROM admin_types",
      [],
      this.rowToType.bind(this),
    );
    if (existing.length > 0) return;

    const now = new Date().toISOString();
    for (const [idx, t] of DEFAULT_TRANSACTION_TYPES.entries()) {
      this.execute(
        "INSERT INTO admin_types (id, name, description, is_active, created_at) VALUES (?, ?, ?, ?, ?)",
        [idx + 1, t.name, t.description, 1, now],
      );
    }
  }

  private seedDefaultAssetsIfEmpty(): void {
    const existing = this.findMany(
      "SELECT * FROM admin_assets",
      [],
      this.rowToAsset.bind(this),
    );
    if (existing.length > 0) return;

    const now = new Date().toISOString();
    for (const [idx, a] of DEFAULT_ADMIN_ASSETS.entries()) {
      this.execute(
        "INSERT INTO admin_assets (id, symbol, name, decimals, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [idx + 1, a.symbol.toUpperCase(), a.name, a.decimals, 1, now],
      );
    }
  }

  // Transaction Types
  findAllTypes(): AdminType[] {
    this.seedDefaultTypesIfEmpty();
    return this.findMany(
      "SELECT * FROM admin_types",
      [],
      this.rowToType.bind(this),
    );
  }

  findTypeById(id: number): AdminType | undefined {
    return this.findOne(
      "SELECT * FROM admin_types WHERE id = ?",
      [id],
      this.rowToType.bind(this),
    );
  }

  createType(data: Partial<AdminType> & { name: string }): AdminType {
    const result = this.execute(
      "INSERT INTO admin_types (name, description, is_active, created_at) VALUES (?, ?, ?, ?)",
      [
        data.name,
        data.description ?? "",
        data.is_active !== false ? 1 : 0,
        new Date().toISOString(),
      ],
    );
    return {
      id: result.lastInsertRowid as number,
      name: data.name,
      description: data.description ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
  }

  updateType(id: number, data: Partial<AdminType>): AdminType | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      fields.push("name = ?");
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push("description = ?");
      values.push(data.description);
    }
    if (data.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(data.is_active ? 1 : 0);
    }

    if (fields.length === 0) return this.findTypeById(id);

    values.push(id);
    this.execute(
      `UPDATE admin_types SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return this.findTypeById(id);
  }

  deleteType(id: number): boolean {
    const result = this.execute("DELETE FROM admin_types WHERE id = ?", [id]);
    return result.changes > 0;
  }

  // Accounts
  findAllAccounts(): AdminAccount[] {
    return this.findMany(
      "SELECT * FROM admin_accounts",
      [],
      this.rowToAccount.bind(this),
    );
  }

  findAccountById(id: number): AdminAccount | undefined {
    return this.findOne(
      "SELECT * FROM admin_accounts WHERE id = ?",
      [id],
      this.rowToAccount.bind(this),
    );
  }

  createAccount(data: Partial<AdminAccount> & { name: string }): AdminAccount {
    const result = this.execute(
      "INSERT INTO admin_accounts (name, type, is_active, created_at) VALUES (?, ?, ?, ?)",
      [
        data.name,
        data.type ?? "",
        data.is_active !== false ? 1 : 0,
        new Date().toISOString(),
      ],
    );
    return {
      id: result.lastInsertRowid as number,
      name: data.name,
      type: data.type ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
  }

  updateAccount(
    id: number,
    data: Partial<AdminAccount>,
  ): AdminAccount | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      fields.push("name = ?");
      values.push(data.name);
    }
    if (data.type !== undefined) {
      fields.push("type = ?");
      values.push(data.type);
    }
    if (data.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(data.is_active ? 1 : 0);
    }

    if (fields.length === 0) return this.findAccountById(id);

    values.push(id);
    this.execute(
      `UPDATE admin_accounts SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return this.findAccountById(id);
  }

  deleteAccount(id: number): boolean {
    const result = this.execute("DELETE FROM admin_accounts WHERE id = ?", [
      id,
    ]);
    return result.changes > 0;
  }

  // Assets
  findAllAssets(): AdminAsset[] {
    this.seedDefaultAssetsIfEmpty();
    return this.findMany(
      "SELECT * FROM admin_assets",
      [],
      this.rowToAsset.bind(this),
    );
  }

  findAssetById(id: number): AdminAsset | undefined {
    return this.findOne(
      "SELECT * FROM admin_assets WHERE id = ?",
      [id],
      this.rowToAsset.bind(this),
    );
  }

  createAsset(data: Partial<AdminAsset> & { symbol: string }): AdminAsset {
    const result = this.execute(
      "INSERT INTO admin_assets (symbol, name, decimals, is_active, created_at) VALUES (?, ?, ?, ?, ?)",
      [
        data.symbol.toUpperCase(),
        data.name ?? "",
        typeof data.decimals === "number" ? data.decimals : 8,
        data.is_active !== false ? 1 : 0,
        new Date().toISOString(),
      ],
    );
    return {
      id: result.lastInsertRowid as number,
      symbol: data.symbol.toUpperCase(),
      name: data.name ?? "",
      decimals: typeof data.decimals === "number" ? data.decimals : 8,
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
  }

  updateAsset(id: number, data: Partial<AdminAsset>): AdminAsset | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.symbol !== undefined) {
      fields.push("symbol = ?");
      values.push(data.symbol.toUpperCase());
    }
    if (data.name !== undefined) {
      fields.push("name = ?");
      values.push(data.name);
    }
    if (data.decimals !== undefined) {
      fields.push("decimals = ?");
      values.push(data.decimals);
    }
    if (data.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(data.is_active ? 1 : 0);
    }

    if (fields.length === 0) return this.findAssetById(id);

    values.push(id);
    this.execute(
      `UPDATE admin_assets SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return this.findAssetById(id);
  }

  deleteAsset(id: number): boolean {
    const result = this.execute("DELETE FROM admin_assets WHERE id = ?", [id]);
    return result.changes > 0;
  }

  // Tags
  findAllTags(): AdminTag[] {
    return this.findMany(
      "SELECT * FROM admin_tags",
      [],
      this.rowToTag.bind(this),
    );
  }

  findTagById(id: number): AdminTag | undefined {
    return this.findOne(
      "SELECT * FROM admin_tags WHERE id = ?",
      [id],
      this.rowToTag.bind(this),
    );
  }

  createTag(data: Partial<AdminTag> & { name: string }): AdminTag {
    const result = this.execute(
      "INSERT INTO admin_tags (name, category, is_active, created_at) VALUES (?, ?, ?, ?)",
      [
        data.name,
        data.category ?? "",
        data.is_active !== false ? 1 : 0,
        new Date().toISOString(),
      ],
    );
    return {
      id: result.lastInsertRowid as number,
      name: data.name,
      category: data.category ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
  }

  updateTag(id: number, data: Partial<AdminTag>): AdminTag | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      fields.push("name = ?");
      values.push(data.name);
    }
    if (data.category !== undefined) {
      fields.push("category = ?");
      values.push(data.category);
    }
    if (data.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(data.is_active ? 1 : 0);
    }

    if (fields.length === 0) return this.findTagById(id);

    values.push(id);
    this.execute(
      `UPDATE admin_tags SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return this.findTagById(id);
  }

  deleteTag(id: number): boolean {
    const result = this.execute("DELETE FROM admin_tags WHERE id = ?", [id]);
    return result.changes > 0;
  }
}

// Pending Actions - JSON implementation
export class PendingActionsRepositoryJson implements IPendingActionsRepository {
  findAll(): PendingAction[] {
    return readStore().pendingActions;
  }

  findById(id: string): PendingAction | undefined {
    return readStore().pendingActions.find((p) => p.id === id);
  }

  findByStatus(status: string): PendingAction[] {
    return readStore().pendingActions.filter((p) => p.status === status);
  }

  findByBatchId(batchId: string): PendingAction[] {
    return readStore().pendingActions.filter((p) => p.batch_id === batchId);
  }

  findDuplicate(params: {
    action: string;
    date: string;
    amount: number;
    counterparty?: string;
  }): PendingAction | undefined {
    const { action, date, amount, counterparty } = params;

    // Find pending actions with matching action, date, and amount
    const candidates = readStore().pendingActions.filter((p) => {
      // Only check pending status
      if (p.status !== "pending") {
        return false;
      }

      // Extract action and params from action_json
      if (!p.action_json || typeof p.action_json !== "object") {
        return false;
      }

      const actionData = p.action_json as any;
      if (!actionData.action || !actionData.params) {
        return false;
      }

      // Check if action type matches
      if (actionData.action !== action) {
        return false;
      }

      // Check if date matches
      if (actionData.params.date !== date) {
        return false;
      }

      // Check if amount matches
      if (actionData.params.vnd_amount !== amount) {
        return false;
      }

      // If counterparty provided, check if it matches
      if (counterparty) {
        return actionData.params.counterparty === counterparty;
      }

      return true;
    });

    // Return first match if any
    return candidates.length > 0 ? candidates[0] : undefined;
  }

  create(data: {
    source: PendingSource;
    raw_input: string;
    toon_text?: string;
    action_json?: unknown;
    confidence?: number;
    batch_id?: string;
    meta?: Record<string, unknown>;
  }): PendingAction {
    const store = readStore();
    const now = new Date().toISOString();
    const item: PendingAction = {
      id: crypto.randomUUID(),
      source: data.source,
      raw_input: data.raw_input,
      toon_text: data.toon_text,
      action_json: data.action_json,
      confidence: data.confidence,
      batch_id: data.batch_id,
      meta: data.meta,
      status: "pending",
      created_at: now,
      updated_at: now,
    };
    store.pendingActions.push(item);
    writeStore(store);
    return item;
  }

  update(id: string, data: Partial<PendingAction>): PendingAction | undefined {
    const store = readStore();
    const index = store.pendingActions.findIndex((p) => p.id === id);
    if (index === -1) return undefined;

    const prev = store.pendingActions[index];
    store.pendingActions[index] = {
      ...prev,
      ...data,
      id: prev.id,
      created_at: prev.created_at,
      updated_at: new Date().toISOString(),
    };
    writeStore(store);
    return store.pendingActions[index];
  }

  delete(id: string): boolean {
    const store = readStore();
    const initialLength = store.pendingActions.length;
    store.pendingActions = store.pendingActions.filter((p) => p.id !== id);
    writeStore(store);
    return store.pendingActions.length < initialLength;
  }
}

// Pending Actions - Database implementation
export class PendingActionsRepositoryDb
  extends BaseDbRepository
  implements IPendingActionsRepository
{
  private rowToPendingAction(row: any): PendingAction {
    return {
      id: row.id,
      source: row.source,
      raw_input: row.raw_input,
      toon_text: row.toon_text,
      action_json: row.action_json ? JSON.parse(row.action_json) : undefined,
      confidence: row.confidence,
      batch_id: row.batch_id,
      meta: row.meta ? JSON.parse(row.meta) : undefined,
      status: row.status,
      created_tx_ids: row.created_tx_ids
        ? JSON.parse(row.created_tx_ids)
        : undefined,
      error: row.error,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  findAll(): PendingAction[] {
    return this.findMany(
      "SELECT * FROM pending_actions",
      [],
      this.rowToPendingAction.bind(this),
    );
  }

  findById(id: string): PendingAction | undefined {
    return this.findOne(
      "SELECT * FROM pending_actions WHERE id = ?",
      [id],
      this.rowToPendingAction.bind(this),
    );
  }

  findByStatus(status: string): PendingAction[] {
    return this.findMany(
      "SELECT * FROM pending_actions WHERE status = ?",
      [status],
      this.rowToPendingAction.bind(this),
    );
  }

  findByBatchId(batchId: string): PendingAction[] {
    return this.findMany(
      "SELECT * FROM pending_actions WHERE batch_id = ?",
      [batchId],
      this.rowToPendingAction.bind(this),
    );
  }

  findDuplicate(params: {
    action: string;
    date: string;
    amount: number;
    counterparty?: string;
  }): PendingAction | undefined {
    const { action, date, amount, counterparty } = params;

    // Build query to find matching pending actions
    let sql = `
      SELECT * FROM pending_actions
      WHERE status = 'pending'
      AND json_extract(action_json, '$.action') = ?
      AND json_extract(action_json, '$.params.date') = ?
      AND json_extract(action_json, '$.params.vnd_amount') = ?
    `;
    const queryParams: any[] = [action, date, amount];

    // Add counterparty filter if provided
    if (counterparty) {
      sql += ` AND json_extract(action_json, '$.params.counterparty') = ?`;
      queryParams.push(counterparty);
    }

    sql += ` LIMIT 1`;

    return this.findOne(sql, queryParams, this.rowToPendingAction.bind(this));
  }

  create(data: {
    source: PendingSource;
    raw_input: string;
    toon_text?: string;
    action_json?: unknown;
    confidence?: number;
    batch_id?: string;
    meta?: Record<string, unknown>;
  }): PendingAction {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.execute(
      `INSERT INTO pending_actions (id, source, raw_input, toon_text, action_json, confidence, batch_id, meta, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.source,
        data.raw_input,
        data.toon_text ?? null,
        data.action_json ? JSON.stringify(data.action_json) : null,
        data.confidence ?? null,
        data.batch_id ?? null,
        data.meta ? JSON.stringify(data.meta) : null,
        "pending",
        now,
        now,
      ],
    );
    return {
      id,
      source: data.source,
      raw_input: data.raw_input,
      toon_text: data.toon_text,
      action_json: data.action_json,
      confidence: data.confidence,
      batch_id: data.batch_id,
      meta: data.meta,
      status: "pending",
      created_at: now,
      updated_at: now,
    };
  }

  update(id: string, data: Partial<PendingAction>): PendingAction | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.status !== undefined) {
      fields.push("status = ?");
      values.push(data.status);
    }
    if (data.toon_text !== undefined) {
      fields.push("toon_text = ?");
      values.push(data.toon_text);
    }
    if (data.action_json !== undefined) {
      fields.push("action_json = ?");
      values.push(data.action_json ? JSON.stringify(data.action_json) : null);
    }
    if (data.confidence !== undefined) {
      fields.push("confidence = ?");
      values.push(data.confidence);
    }
    if (data.meta !== undefined) {
      fields.push("meta = ?");
      values.push(data.meta ? JSON.stringify(data.meta) : null);
    }
    if (data.created_tx_ids !== undefined) {
      fields.push("created_tx_ids = ?");
      values.push(
        data.created_tx_ids ? JSON.stringify(data.created_tx_ids) : null,
      );
    }
    if (data.error !== undefined) {
      fields.push("error = ?");
      values.push(data.error);
    }
    fields.push("updated_at = ?");
    values.push(new Date().toISOString());

    if (fields.length <= 1) return this.findById(id);

    values.push(id);
    this.execute(
      `UPDATE pending_actions SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.execute("DELETE FROM pending_actions WHERE id = ?", [
      id,
    ]);
    return result.changes > 0;
  }
}
