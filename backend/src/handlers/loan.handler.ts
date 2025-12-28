import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  LoanAgreement,
  LoanCreateBatchRequest,
  LoanCreateBatchSchema,
  LoanCreateRequest,
  LoanCreateSchema,
} from "../types";
import { loanService } from "../services/loan.service";

export const loansRouter = Router();

function parseId(id: string): string {
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

loansRouter.post("/loans", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    if (Array.isArray(body.items)) {
      const parsed: LoanCreateBatchRequest = LoanCreateBatchSchema.parse(body);
      const created = [] as Array<{ loan: LoanAgreement; transactionId: string }>;

      for (const item of parsed.items) {
        const result = await loanService.createLoan(item);
        created.push({ loan: result.loan, transactionId: result.tx.id });
      }

      return res.status(201).json({
        ok: true,
        created: created.length,
        loans: created.map(c => c.loan),
        transactions: created.map(c => c.transactionId)
      });
    } else {
      const parsed: LoanCreateRequest = LoanCreateSchema.parse(body);
      const result = await loanService.createLoan(parsed);
      return res.status(201).json({ ok: true, loan: result.loan, transaction: result.tx });
    }
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Invalid loan request" });
  }
});

loansRouter.get("/loans", async (_req: Request, res: Response) => {
  try {
    const list = await loanService.listLoansView();
    return res.json(list);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to list loans" });
  }
});

loansRouter.get("/loans/:id", async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const view = await loanService.getLoanView(id);
    if (!view) return res.status(404).json({ error: "Loan not found" });
    return res.json(view);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to load loan" });
  }
});

loansRouter.post("/loans/:id/repay", async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const body = RepayPrincipalSchema.parse(req.body || {});
    const transaction = await loanService.recordPrincipalRepayment(id, body);
    if (!transaction) return res.status(404).json({ error: "Loan not found" });
    return res.status(201).json({ ok: true, transaction });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Invalid repay payload" });
  }
});

loansRouter.post("/loans/:id/interest", async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const body = PayInterestSchema.parse(req.body || {});
    const transaction = await loanService.recordInterestIncome(id, body);
    if (!transaction) return res.status(404).json({ error: "Loan not found" });
    return res.status(201).json({ ok: true, transaction });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Invalid interest payload" });
  }
});
