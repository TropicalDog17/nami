import { v4 as uuidv4 } from "uuid";
import { LoanAgreement, LoanCreateRequest, Transaction } from "../types";
import { loanRepository } from "../repositories";
import { transactionRepository } from "../repositories";
import { priceService } from "./price.service";

export interface LoanView {
  loan: LoanAgreement;
  metrics: {
    principalIssued: number;
    principalRepaid: number;
    principalOutstanding: number;
    principalOutstandingUSD: number;
    interestRate: number;
    period: string;
    suggestedNextPeriodInterest: number;
    totalInterestReceived: number;
    totalInterestReceivedUSD: number;
  };
  transactions: Transaction[];
}

export class LoanService {
  async createLoan(data: LoanCreateRequest): Promise<{ loan: LoanAgreement; tx: Transaction }> {
    const id = uuidv4();
    const startAt = data.startAt ?? new Date().toISOString();
    const createdAt = new Date().toISOString();

    const loan: LoanAgreement = {
      id,
      counterparty: data.counterparty || "general",
      asset: data.asset,
      principal: data.principal,
      interestRate: data.interestRate,
      period: data.period,
      startAt,
      maturityAt: data.maturityAt,
      note: data.note,
      account: data.account,
      status: "ACTIVE",
      createdAt,
    };

    // Record LOAN transaction that funds the loan (cash out)
    const rate = await priceService.getRateUSD(data.asset, startAt);
    const tx: Transaction = {
      id: uuidv4(),
      type: "LOAN",
      asset: data.asset,
      amount: data.principal,
      createdAt: startAt,
      account: data.account,
      note: data.note ?? `Loan to ${loan.counterparty}`,
      counterparty: loan.counterparty,
      loanId: id,
      rate,
      usdAmount: data.principal * rate.rateUSD,
    } as Transaction;

    loanRepository.create(loan);
    transactionRepository.create(tx);

    return { loan, tx };
  }

  listLoans(): LoanAgreement[] {
    return loanRepository.findAll();
  }

  getLoanById(id: string): LoanAgreement | undefined {
    return loanRepository.findById(id);
  }

  async listLoansView(): Promise<LoanView[]> {
    const loans = loanRepository.findAll();
    const views: LoanView[] = [];

    for (const loan of loans) {
      const view = await this.getLoanView(loan.id);
      if (view) views.push(view);
    }

    return views;
  }

  async getLoanView(id: string): Promise<LoanView | undefined> {
    const loan = loanRepository.findById(id);
    if (!loan) return undefined;

    const related = transactionRepository.findByLoanId(id);

    const principalIssued = related
      .filter(t => t.type === "LOAN")
      .reduce((sum, t) => sum + t.amount, 0);

    const principalRepaid = related
      .filter(t => t.type === "REPAY" && (t as any).direction === "LOAN")
      .reduce((sum, t) => sum + t.amount, 0);

    const principalOutstanding = Math.max(0, principalIssued - principalRepaid);

    const interestTxs = related.filter(
      t => t.type === "INCOME" && (t.category === "INTEREST_INCOME" || /interest/i.test(t.note || ""))
    );

    const interestReceived = interestTxs.reduce((sum, t) => sum + t.amount, 0);
    const rate = await priceService.getRateUSD(loan.asset);

    const metrics = {
      principalIssued,
      principalRepaid,
      principalOutstanding,
      principalOutstandingUSD: principalOutstanding * rate.rateUSD,
      interestRate: loan.interestRate,
      period: loan.period,
      suggestedNextPeriodInterest: principalOutstanding * loan.interestRate,
      totalInterestReceived: interestReceived,
      totalInterestReceivedUSD: interestReceived * rate.rateUSD,
    };

    return { loan, metrics, transactions: related };
  }

  async recordPrincipalRepayment(
    loanId: string,
    input: { amount: number; at?: string; account?: string; note?: string }
  ): Promise<Transaction | undefined> {
    const loan = loanRepository.findById(loanId);
    if (!loan) return undefined;

    const at = input.at ?? new Date().toISOString();
    const rate = await priceService.getRateUSD(loan.asset, at);

    const tx: Transaction = {
      id: uuidv4(),
      type: "REPAY",
      asset: loan.asset,
      amount: input.amount,
      createdAt: at,
      account: input.account,
      note: input.note ?? `Repay principal for loan ${loan.id}`,
      direction: "LOAN" as any,
      counterparty: loan.counterparty,
      loanId: loan.id,
      rate,
      usdAmount: input.amount * rate.rateUSD,
    } as Transaction;

    transactionRepository.create(tx);
    return tx;
  }

  async recordInterestIncome(
    loanId: string,
    input: { amount: number; at?: string; account?: string; note?: string }
  ): Promise<Transaction | undefined> {
    const loan = loanRepository.findById(loanId);
    if (!loan) return undefined;

    const at = input.at ?? new Date().toISOString();
    const rate = await priceService.getRateUSD(loan.asset, at);

    const tx: Transaction = {
      id: uuidv4(),
      type: "INCOME",
      asset: loan.asset,
      amount: input.amount,
      createdAt: at,
      account: input.account,
      note: input.note ?? `Interest income for loan ${loan.id}`,
      category: "INTEREST_INCOME",
      counterparty: loan.counterparty,
      loanId: loan.id,
      rate,
      usdAmount: input.amount * rate.rateUSD,
    } as Transaction;

    transactionRepository.create(tx);
    return tx;
  }
}

export const loanService = new LoanService();
