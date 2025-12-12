import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import {
    Asset,
    BorrowLoanRequest,
    BorrowLoanSchema,
    IncomeExpenseRequest,
    IncomeExpenseSchema,
    InitialRequest,
    InitialRequestSchema,
    RepayRequest,
    RepaySchema,
    Transaction,
} from "./types";
import { priceService } from "./priceService";
import { store } from "./store";

export const router = Router();

router.get("/health", (_req, res) => {
    res.json({ ok: true });
});

function nowISO() {
    return new Date().toISOString();
}

async function buildTransactionBase(
    asset: Asset,
    amount: number,
    at?: string,
    account?: string
) {
    const rate = await priceService.getRateUSD(asset, at);
    return {
        asset,
        amount,
        createdAt: at ?? nowISO(),
        account,
        rate,
        usdAmount: amount * rate.rateUSD,
    };
}

router.post("/transactions/initial", async (req, res) => {
    try {
        const body: InitialRequest = InitialRequestSchema.parse(req.body);
        const results: Transaction[] = [];
        for (const item of body.items) {
            const base = await buildTransactionBase(
                item.asset,
                item.amount,
                item.at,
                item.account
            );
            const tx: Transaction = {
                id: uuidv4(),
                type: "INITIAL",
                note: item.note,
                ...base,
            } as Transaction;
            store.addTransaction(tx);
            results.push(tx);
        }
        res.status(201).json({
            created: results.length,
            transactions: results,
        });
    } catch (e: any) {
        res.status(400).json({ error: e?.message || "Invalid request" });
    }
});

router.post("/transactions/income", async (req, res) => {
    try {
        const body: IncomeExpenseRequest = IncomeExpenseSchema.parse(req.body);
        const base = await buildTransactionBase(
            body.asset,
            body.amount,
            body.at,
            body.account
        );
        const tx: Transaction = {
            id: uuidv4(),
            type: "INCOME",
            note: body.note,
            ...base,
        } as Transaction;
        store.addTransaction(tx);
        res.status(201).json(tx);
    } catch (e: any) {
        res.status(400).json({ error: e?.message || "Invalid request" });
    }
});

router.post("/transactions/expense", async (req, res) => {
    try {
        const body: IncomeExpenseRequest = IncomeExpenseSchema.parse(req.body);
        const base = await buildTransactionBase(
            body.asset,
            body.amount,
            body.at,
            body.account
        );
        const tx: Transaction = {
            id: uuidv4(),
            type: "EXPENSE",
            note: body.note,
            ...base,
        } as Transaction;
        store.addTransaction(tx);
        res.status(201).json(tx);
    } catch (e: any) {
        res.status(400).json({ error: e?.message || "Invalid request" });
    }
});

router.post("/transactions/borrow", async (req, res) => {
    try {
        const body: BorrowLoanRequest = BorrowLoanSchema.parse(req.body);
        const base = await buildTransactionBase(
            body.asset,
            body.amount,
            body.at,
            body.account
        );
        const tx: Transaction = {
            id: uuidv4(),
            type: "BORROW",
            counterparty: body.counterparty,
            note: body.note,
            ...base,
        } as Transaction;
        store.addTransaction(tx);
        res.status(201).json(tx);
    } catch (e: any) {
        res.status(400).json({ error: e?.message || "Invalid request" });
    }
});

router.post("/transactions/loan", async (req, res) => {
    try {
        const body: BorrowLoanRequest = BorrowLoanSchema.parse(req.body);
        const base = await buildTransactionBase(
            body.asset,
            body.amount,
            body.at,
            body.account
        );
        const tx: Transaction = {
            id: uuidv4(),
            type: "LOAN",
            counterparty: body.counterparty,
            note: body.note,
            ...base,
        } as Transaction;
        store.addTransaction(tx);
        res.status(201).json(tx);
    } catch (e: any) {
        res.status(400).json({ error: e?.message || "Invalid request" });
    }
});

router.post("/transactions/repay", async (req, res) => {
    try {
        const body: RepayRequest = RepaySchema.parse(req.body);
        const base = await buildTransactionBase(
            body.asset,
            body.amount,
            body.at,
            body.account
        );
        const tx: Transaction = {
            id: uuidv4(),
            type: "REPAY",
            direction: body.direction,
            counterparty: body.counterparty,
            note: body.note,
            ...base,
        } as Transaction;
        store.addTransaction(tx);
        res.status(201).json(tx);
    } catch (e: any) {
        res.status(400).json({ error: e?.message || "Invalid request" });
    }
});

router.get("/report", async (_req, res) => {
    try {
        const r = await store.report();
        res.json(r);
    } catch (e: any) {
        res.status(500).json({
            error: e?.message || "Failed to generate report",
        });
    }
});

// List transactions (for UI)
router.get("/transactions", (req, res) => {
    const investmentId = (req.query.investment_id as string | undefined)?.toString();
    if (investmentId) {
        const entries = store.getVaultEntries(investmentId);
        const mapped = entries.map((e) => ({
            id: `${investmentId}-${e.at}-${e.type}`,
            date: e.at,
            type: e.type === 'DEPOSIT' ? 'deposit' : 'withdrawal',
            asset: e.asset.symbol,
            account: e.account ?? investmentId,
            quantity: e.asset.symbol === 'USD' ? e.usdValue : e.amount,
            amount_usd: e.usdValue,
            amount_vnd: undefined,
            counterparty: investmentId,
            note: e.note,
            investment_id: investmentId,
        }));
        return res.json(mapped);
    }
    res.json(store.all());
});

// Delete a transaction by id
router.delete("/transactions/:id", (req, res) => {
    const id = req.params.id;
    const existing = store.getTransaction(id);
    if (!existing) {
        return res.status(404).json({ error: "Transaction not found" });
    }
    const ok = store.deleteTransaction(id);
    if (!ok) return res.status(500).json({ error: "Failed to delete" });
    return res.status(204).send();
});

// Unified create endpoint for buy/sell convenience from frontend QuickSell
router.post("/transactions", async (req, res) => {
    try {
        const body = req.body || {};
        const type = String(body.type || "").toLowerCase();
        const at = String(body.date || body.at || "") || undefined;

        if (type === "deposit" || type === "withdraw") {
            const symbol = String(body.asset || 'USD').toUpperCase();
            const qty = Number(body.quantity || body.amount || 0);
            const at = String(body.date || body.at || '') || undefined;
            const account = body.account ? String(body.account) : undefined;
            if (!symbol || !(qty > 0)) {
                return res.status(400).json({ error: 'Invalid payload' });
            }
            const asset: Asset = { type: symbol === 'USD' || symbol.length === 3 ? 'FIAT' : 'CRYPTO', symbol };
            const rate = await priceService.getRateUSD(asset, at);
            const common = {
                asset,
                amount: qty,
                createdAt: at ?? new Date().toISOString(),
                rate,
                usdAmount: qty * rate.rateUSD,
                account,
            };
            if (type === 'deposit') {
                const tx: Transaction = { id: uuidv4(), type: 'EXPENSE', note: body.note ?? 'deposit', ...common } as Transaction;
                store.addTransaction(tx);
                return res.status(201).json({ ok: true, transactions: [tx] });
            } else {
                const tx: Transaction = { id: uuidv4(), type: 'INCOME', note: body.note ?? 'withdraw', ...common } as Transaction;
                store.addTransaction(tx);
                return res.status(201).json({ ok: true, transactions: [tx] });
            }
        }

        if (type === "income" || type === "expense") {
            const symbol = String(body.asset || body.base_asset || 'USD').toUpperCase();
            const qty = Number(body.quantity || body.amount || 0);
            const at = String(body.date || body.at || '') || undefined;
            const account = body.account ? String(body.account) : undefined;
            if (!symbol || !(qty > 0)) {
                return res.status(400).json({ error: 'Invalid payload' });
            }
            const asset: Asset = { type: symbol === 'USD' || symbol.length === 3 ? 'FIAT' : 'CRYPTO', symbol };
            const base = await buildTransactionBase(asset, qty, at, account);
            const tx: Transaction = {
                id: uuidv4(),
                type: type.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE',
                note: body.note,
                ...base,
            } as Transaction;
            store.addTransaction(tx);
            return res.status(201).json({ ok: true, transactions: [tx] });
        }

        if (type === "sell") {
            const symbol = String(
                body.asset || body.base_asset || ""
            ).toUpperCase();
            const qty = Number(body.quantity || body.qty || 0);
            const unitPriceUSD = Number(
                body.price_local || body.unit_price_usd || 0
            );
            if (!symbol || !(qty > 0) || !(unitPriceUSD > 0)) {
                return res.status(400).json({ error: "Invalid sell payload" });
            }
            const asset: Asset = {
                type:
                    symbol === "USD" || symbol.length === 3 ? "FIAT" : "CRYPTO",
                symbol,
            };
            const usd: Asset = { type: "FIAT", symbol: "USD" };

            const baseRate = await priceService.getRateUSD(asset, at);
            const usdRate = await priceService.getRateUSD(usd, at);

            const expenseTx: Transaction = {
                id: uuidv4(),
                type: "EXPENSE",
                note: `spot_sell ${qty} ${symbol} @ ${unitPriceUSD} USD`,
                asset,
                amount: qty,
                createdAt: at ?? new Date().toISOString(),
                rate: baseRate,
                usdAmount: qty * baseRate.rateUSD,
            } as Transaction;
            const incomeTx: Transaction = {
                id: uuidv4(),
                type: "INCOME",
                note: `spot_sell proceeds ${qty * unitPriceUSD} USD`,
                asset: usd,
                amount: qty * unitPriceUSD,
                createdAt: at ?? new Date().toISOString(),
                rate: usdRate,
                usdAmount: qty * unitPriceUSD * usdRate.rateUSD,
            } as Transaction;
            store.addTransaction(expenseTx);
            store.addTransaction(incomeTx);
            return res.status(201).json({
                ok: true,
                created: 2,
                transactions: [expenseTx, incomeTx],
            });
        }

        if (type === "buy") {
            const symbol = String(
                body.asset || body.base_asset || ""
            ).toUpperCase();
            const qty = Number(body.quantity || body.qty || 0);
            const unitPriceUSD = Number(
                body.price_local || body.unit_price_usd || 0
            );
            if (!symbol || !(qty > 0) || !(unitPriceUSD > 0)) {
                return res.status(400).json({ error: "Invalid buy payload" });
            }
            const asset: Asset = {
                type:
                    symbol === "USD" || symbol.length === 3 ? "FIAT" : "CRYPTO",
                symbol,
            };
            const usd: Asset = { type: "FIAT", symbol: "USD" };

            const baseRate = await priceService.getRateUSD(asset, at);
            const usdRate = await priceService.getRateUSD(usd, at);

            const incomeTx: Transaction = {
                id: uuidv4(),
                type: "INCOME",
                note: `spot_buy ${qty} ${symbol} @ ${unitPriceUSD} USD`,
                asset,
                amount: qty,
                createdAt: at ?? new Date().toISOString(),
                rate: baseRate,
                usdAmount: qty * baseRate.rateUSD,
            } as Transaction;
            const expenseTx: Transaction = {
                id: uuidv4(),
                type: "EXPENSE",
                note: `spot_buy cost ${qty * unitPriceUSD} USD`,
                asset: usd,
                amount: qty * unitPriceUSD,
                createdAt: at ?? new Date().toISOString(),
                rate: usdRate,
                usdAmount: qty * unitPriceUSD * usdRate.rateUSD,
            } as Transaction;
            store.addTransaction(incomeTx);
            store.addTransaction(expenseTx);
            return res.status(201).json({
                ok: true,
                created: 2,
                transactions: [incomeTx, expenseTx],
            });
        }

        return res.status(400).json({
            error: "Unsupported transaction type. Use income/expense, deposit/withdraw, buy/sell or specific endpoints.",
        });
    } catch (e: any) {
        res.status(400).json({
            error: e?.message || "Invalid transaction request",
        });
    }
});
