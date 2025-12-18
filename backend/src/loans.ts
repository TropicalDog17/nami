import { Router } from "express";
import { z } from "zod";
import { priceService } from "./priceService";
import {
  Asset,
  LoanAgreement,
  LoanCreateBatchRequest,
  LoanCreateBatchSchema,
  LoanCreateRequest,
  LoanCreateSchema,
} from "./types";
import { store } from "./store";

export const loansRouter = Router();

// Helpers
function parseId(id: string) {
  return String(id);
}

const RepayPrincipalSchema = z.object({
  amount: z.number().positive(),
  at: z.string().datetime().optional(),
  account: z.string().optional(),
  note: z.string().optional(),
});

const PayInterestSchema = z.object({
  amount: z.number().positive(),
  at: z.string().datetime().optional(),
  account: z.string().optional(),
  note: z.string().optional(),
});

loansRouter.post("/loans", async (req, res) => {
  try {
    const body = req.body || {};
    if (Array.isArray(body.items)) {
      const parsed: LoanCreateBatchRequest = LoanCreateBatchSchema.parse(body);
      const created = [] as Array<{ loan: LoanAgreement; transactionId: string }>;
      for (const item of parsed.items) {
        const r = await store.createLoan(item);
        created.push({ loan: r.loan, transactionId: r.tx.id });
      }
      return res.status(201).json({ ok: true, created: created.length, loans: created.map(c => c.loan), transactions: created.map(c => c.transactionId) });
    } else {
      const parsed: LoanCreateRequest = LoanCreateSchema.parse(body);
      const r = await store.createLoan(parsed);
      return res.status(201).json({ ok: true, loan: r.loan, transaction: r.tx });
    }
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Invalid loan request" });
  }
});

loansRouter.get("/loans", async (_req, res) => {
  try {
    const list = await store.listLoansView();
    return res.json(list);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to list loans" });
  }
});

loansRouter.get("/loans/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const v = await store.getLoanView(id);
    if (!v) return res.status(404).json({ error: "Loan not found" });
    return res.json(v);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to load loan" });
  }
});

loansRouter.post("/loans/:id/repay", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const body = RepayPrincipalSchema.parse(req.body || {});
    const r = await store.recordLoanPrincipalRepayment(id, body);
    if (!r) return res.status(404).json({ error: "Loan not found" });
    return res.status(201).json({ ok: true, transaction: r });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Invalid repay payload" });
  }
});

loansRouter.post("/loans/:id/interest", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const body = PayInterestSchema.parse(req.body || {});
    const r = await store.recordLoanInterestIncome(id, body);
    if (!r) return res.status(404).json({ error: "Loan not found" });
    return res.status(201).json({ ok: true, transaction: r });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Invalid interest payload" });
  }
});


