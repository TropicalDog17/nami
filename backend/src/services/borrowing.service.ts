import { v4 as uuidv4 } from "uuid";
import { BorrowingAgreement, BorrowingCreateRequest } from "../types";
import {
  borrowingRepository,
  settingsRepository,
  transactionRepository,
} from "../repositories";
import { transactionService } from "./transaction.service";
import { vaultService } from "./vault.service";
import { priceService } from "./price.service";

const AUTO_DEDUCTION_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
let schedulerStarted = false;

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const next = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
  return next.toISOString();
}

export class BorrowingService {
  async createBorrowingAgreement(
    params: BorrowingCreateRequest,
  ): Promise<BorrowingAgreement> {
    const now = new Date().toISOString();
    const startAt = params.startAt ?? now;
    const firstDueAt = params.firstDueAt ?? startAt;
    const account =
      params.account?.trim() || settingsRepository.getDefaultSpendingVaultName();

    const borrowing: BorrowingAgreement = {
      id: uuidv4(),
      counterparty: params.counterparty,
      asset: params.asset,
      principal: params.principal,
      monthlyPayment: params.monthlyPayment,
      startAt,
      firstDueAt,
      nextPaymentAt: firstDueAt,
      outstanding: params.principal,
      note: params.note,
      account,
      status: "ACTIVE",
      createdAt: now,
    };

    borrowingRepository.create(borrowing);

    // Record the initial borrow as a financing inflow
    await transactionService.createBorrowTransaction({
      asset: params.asset,
      amount: params.principal,
      at: startAt,
      account,
      counterparty: params.counterparty,
      note: params.note ? `Borrow: ${params.note}` : "Borrow agreement created",
      sourceRef: `borrow-open:${borrowing.id}`,
    });

    return borrowing;
  }

  listBorrowings(status?: string): BorrowingAgreement[] {
    if (status) return borrowingRepository.findByStatus(status);
    return borrowingRepository.findAll();
  }

  async processDuePayments(now: Date = new Date()): Promise<void> {
    const borrowings = borrowingRepository.findByStatus("ACTIVE");
    for (const borrowing of borrowings) {
      let nextPaymentAt = borrowing.nextPaymentAt;
      let outstanding = borrowing.outstanding;

      while (outstanding > 0) {
        const dueDate = new Date(nextPaymentAt);
        if (Number.isNaN(dueDate.getTime()) || dueDate > now) break;

        const paymentAmount = Math.min(
          borrowing.monthlyPayment,
          outstanding,
        );
        const paymentAt = dueDate.toISOString();
        const account =
          borrowing.account || settingsRepository.getDefaultSpendingVaultName();
        const sourceRef = `borrow-auto:${borrowing.id}:${paymentAt.slice(
          0,
          10,
        )}`;

        const existing = transactionRepository.findExisting({
          sourceRef,
          date: paymentAt,
          amount: paymentAmount,
          type: "REPAY",
          account,
        });

        if (!existing) {
          await transactionService.createRepayTransaction({
            asset: borrowing.asset,
            amount: paymentAmount,
            direction: "BORROW",
            at: paymentAt,
            account,
            counterparty: borrowing.counterparty,
            note: `Auto repayment for ${borrowing.counterparty}`,
            sourceRef,
          });

          // Record vault outflow from Income vault
          const rate = await priceService.getRateUSD(borrowing.asset, paymentAt);
          const usdValue = paymentAmount * rate.rateUSD;
          vaultService.ensureVault(account);
          vaultService.addVaultEntry({
            vault: account,
            type: "WITHDRAW",
            asset: borrowing.asset,
            amount: paymentAmount,
            usdValue,
            at: paymentAt,
            account: borrowing.counterparty,
            note: `Borrow repayment (${borrowing.id})`,
          });
        }

        outstanding = Math.max(0, outstanding - paymentAmount);
        nextPaymentAt = addMonths(nextPaymentAt, 1);
      }

      const updates: Partial<BorrowingAgreement> = {
        outstanding,
        nextPaymentAt,
        status: outstanding > 0 ? "ACTIVE" : "CLOSED",
      };
      borrowingRepository.update(borrowing.id, updates);
    }
  }

  startAutoDeductionScheduler(): void {
    if (schedulerStarted) return;
    schedulerStarted = true;

    void this.processDuePayments();
    setInterval(() => {
      void this.processDuePayments();
    }, AUTO_DEDUCTION_INTERVAL_MS);
  }
}

export const borrowingService = new BorrowingService();
