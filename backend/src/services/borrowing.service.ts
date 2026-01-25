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

  async recordManualRepayment(params: {
    counterparty: string;
    asset: { type: string; symbol: string };
    amount: number;
    at?: string;
    account?: string;
    note?: string;
  }): Promise<{ transaction?: any; updatedBorrowings: string[] }> {
    const counterparty = params.counterparty || "general";
    const asset = params.asset;
    const amount = params.amount;
    const paymentAt = params.at || new Date().toISOString();
    const account =
      params.account || settingsRepository.getDefaultSpendingVaultName();

    // Find all active borrowings for this counterparty and asset
    const borrowings = borrowingRepository
      .findByStatus("ACTIVE")
      .filter(
        (b) =>
          b.counterparty === counterparty &&
          b.asset.type === asset.type &&
          b.asset.symbol === asset.symbol &&
          b.outstanding > 0
      );

    if (borrowings.length === 0) {
      // No matching borrowings - just create the transaction without updating borrowing
      const tx = await transactionService.createRepayTransaction({
        asset: asset as any,
        amount,
        direction: "BORROW",
        at: paymentAt,
        account,
        counterparty,
        note: params.note,
      });

      // Record vault outflow
      const rate = await priceService.getRateUSD(asset as any, paymentAt);
      const usdValue = amount * rate.rateUSD;
      vaultService.ensureVault(account);
      vaultService.addVaultEntry({
        vault: account,
        type: "WITHDRAW",
        asset: asset as any,
        amount,
        usdValue,
        at: paymentAt,
        account: counterparty,
        note: params.note || `Repayment to ${counterparty}`,
      });

      return { transaction: tx, updatedBorrowings: [] };
    }

    // Distribute payment across borrowings (proportional to outstanding)
    const totalOutstanding = borrowings.reduce(
      (sum, b) => sum + b.outstanding,
      0
    );
    let remainingAmount = amount;
    const updatedBorrowingIds: string[] = [];
    let lastTransaction: any;

    for (const borrowing of borrowings) {
      if (remainingAmount <= 0) break;

      const borrowingShare =
        (borrowing.outstanding / totalOutstanding) * amount;
      const paymentAmount = Math.min(
        borrowingShare,
        borrowing.outstanding,
        remainingAmount
      );

      if (paymentAmount > 0) {
        const sourceRef = `borrow-manual:${borrowing.id}:${paymentAt.slice(
          0,
          10
        )}`;

        lastTransaction = await transactionService.createRepayTransaction({
          asset: borrowing.asset,
          amount: paymentAmount,
          direction: "BORROW",
          at: paymentAt,
          account,
          counterparty: borrowing.counterparty,
          note: params.note || `Repayment for ${borrowing.counterparty}`,
          sourceRef,
        });

        // Record vault outflow
        const rate = await priceService.getRateUSD(
          borrowing.asset,
          paymentAt
        );
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
          note: params.note || `Borrow repayment (${borrowing.id})`,
        });

        // Update borrowing outstanding
        const newOutstanding = Math.max(
          0,
          borrowing.outstanding - paymentAmount
        );
        const updates: Partial<BorrowingAgreement> = {
          outstanding: newOutstanding,
          status: newOutstanding > 0 ? "ACTIVE" : "CLOSED",
        };
        borrowingRepository.update(borrowing.id, updates);
        updatedBorrowingIds.push(borrowing.id);

        remainingAmount -= paymentAmount;
      }
    }

    return { transaction: lastTransaction, updatedBorrowings: updatedBorrowingIds };
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
