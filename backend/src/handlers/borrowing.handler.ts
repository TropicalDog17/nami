import { Router, Request, Response } from "express";
import { z } from "zod";
import { BorrowingCreateSchema, AssetSchema } from "../types";
import { borrowingService } from "../services";

export const borrowingsRouter = Router();

const ManualRepaymentSchema = z.object({
  counterparty: z.string().default("general"),
  asset: AssetSchema,
  amount: z.number().positive(),
  at: z.string().datetime().optional(),
  account: z.string().optional(),
  note: z.string().optional(),
});

borrowingsRouter.get("/borrowings", (_req: Request, res: Response) => {
  try {
    const status = _req.query.status ? String(_req.query.status) : undefined;
    const borrowings = borrowingService.listBorrowings(status);
    res.json(borrowings);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to list borrowings" });
  }
});

borrowingsRouter.post("/borrowings", async (req: Request, res: Response) => {
  try {
    const body = BorrowingCreateSchema.parse(req.body);
    const borrowing = await borrowingService.createBorrowingAgreement(body);
    res.status(201).json(borrowing);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Invalid request" });
  }
});

borrowingsRouter.post(
  "/borrowings/repay",
  async (req: Request, res: Response) => {
    try {
      const body = ManualRepaymentSchema.parse(req.body);
      const result = await borrowingService.recordManualRepayment(body);
      res.status(201).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Invalid request" });
    }
  }
);
