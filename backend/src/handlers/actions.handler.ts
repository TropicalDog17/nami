import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { priceService } from "../services/price.service";
import { Asset, Transaction } from "../types";
import { transactionRepository } from "../repositories";
import { createAssetFromSymbol } from "../utils/asset.util";

export const actionsRouter = Router();

function toISODate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  // Accept YYYY-MM-DD and convert to start of day UTC
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  const iso = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0),
  ).toISOString();
  return iso;
}

// Robustly unwrap QuickBuyModal's payload variants
function unwrapActionBody(body: any): { action?: string; params?: any } {
  if (!body || typeof body !== "object") return {};
  // Normal: { action: 'spot_buy', params: {...} }
  if (typeof body.action === "string" && body.action !== "/api/actions") {
    return { action: body.action, params: body.params };
  }
  // QuickBuy first attempt: { action: '/api/actions', params: { action: 'spot_buy', params: {...} } }
  if (
    body.action === "/api/actions" &&
    body.params &&
    typeof body.params === "object"
  ) {
    const inner = body.params;
    if (typeof inner.action === "string") {
      return { action: inner.action, params: inner.params };
    }
  }
  return { action: body.action, params: body.params };
}

actionsRouter.post("/actions", async (req, res) => {
  try {
    const { action, params } = unwrapActionBody(req.body);
    if (!action) return res.status(400).json({ error: "Missing action" });

    switch (action) {
      case "spot_buy": {
        // params: { date, exchange_account, base_asset, quote_asset, quantity, price_quote?, fee_percent? }
        const base = String(params?.base_asset ?? "").toUpperCase();
        const quote = String(params?.quote_asset ?? "").toUpperCase();
        const quantity = Number(params?.quantity ?? 0);
        if (!base || !quote || !(quantity > 0)) {
          return res.status(400).json({ error: "Invalid spot_buy params" });
        }
        const feePercent = params?.fee_percent ? Number(params.fee_percent) : 0;
        let priceQuote = params?.price_quote ? Number(params.price_quote) : NaN;
        const atISO = toISODate(params?.date);

        const baseAsset: Asset = createAssetFromSymbol(base);
        const quoteAsset: Asset = createAssetFromSymbol(quote);

        if (!isFinite(priceQuote) || priceQuote <= 0) {
          // derive from USD rates: price_quote = (base/USD) / (quote/USD) in quote units
          const baseRate = await priceService.getRateUSD(baseAsset, atISO);
          const quoteRate = await priceService.getRateUSD(quoteAsset, atISO);
          priceQuote = baseRate.rateUSD / quoteRate.rateUSD;
        }

        const grossQuoteSpent = quantity * priceQuote;
        const totalQuoteSpent =
          grossQuoteSpent * (1 + (isFinite(feePercent) ? feePercent / 100 : 0));

        // Create two transactions: income base, expense quote
        const baseRate = await priceService.getRateUSD(baseAsset, atISO);
        const quoteRate = await priceService.getRateUSD(quoteAsset, atISO);

        const account: string | undefined = params?.exchange_account
          ? String(params.exchange_account)
          : undefined;

        const incomeTx: Transaction = {
          id: uuidv4(),
          type: "INCOME",
          note: `spot_buy ${quantity} ${base} @ ${priceQuote} ${quote}`,
          asset: baseAsset,
          amount: quantity,
          createdAt: atISO ?? new Date().toISOString(),
          account,
          rate: baseRate,
          usdAmount: quantity * baseRate.rateUSD,
        } as Transaction;

        const expenseTx: Transaction = {
          id: uuidv4(),
          type: "EXPENSE",
          note: `spot_buy cost ${totalQuoteSpent} ${quote}${
            isFinite(feePercent) && feePercent > 0
              ? ` (+${feePercent}% fee)`
              : ""
          }`,
          asset: quoteAsset,
          amount: totalQuoteSpent,
          createdAt: atISO ?? new Date().toISOString(),
          account,
          rate: quoteRate,
          usdAmount: totalQuoteSpent * quoteRate.rateUSD,
        } as Transaction;

        transactionRepository.create(incomeTx);
        transactionRepository.create(expenseTx);

        return res.status(201).json({
          ok: true,
          created: 2,
          transactions: [incomeTx, expenseTx],
        });
      }
      case "init_balance": {
        // params: { date, account, asset, quantity, price_local?, note? }
        const symbol = String(params?.asset ?? "").toUpperCase();
        const quantity = Number(params?.quantity ?? 0);
        if (!symbol || !(quantity > 0)) {
          return res.status(400).json({ error: "Invalid init_balance params" });
        }
        const atISO = toISODate(params?.date);
        const account: string | undefined = params?.account
          ? String(params.account)
          : undefined;
        const note: string | undefined = params?.note
          ? String(params.note)
          : undefined;

        const asset: Asset = createAssetFromSymbol(symbol);

        let rateUSD: number | undefined = undefined;
        if (params?.price_local && Number(params.price_local) > 0) {
          rateUSD = Number(params.price_local);
        }
        const rate =
          rateUSD && isFinite(rateUSD) && rateUSD > 0
            ? {
                asset,
                rateUSD,
                timestamp: atISO ?? new Date().toISOString(),
                source: "FIXED" as const,
              }
            : await priceService.getRateUSD(asset, atISO);

        const tx: Transaction = {
          id: uuidv4(),
          type: "INITIAL",
          note,
          asset,
          amount: quantity,
          createdAt: atISO ?? new Date().toISOString(),
          account,
          rate,
          usdAmount: quantity * rate.rateUSD,
        } as Transaction;

        transactionRepository.create(tx);
        return res
          .status(201)
          .json({ ok: true, created: 1, transactions: [tx] });
      }
      case "transfer": {
        const transferId = uuidv4();
        const fromAccount = String(params?.from_account || "");
        const toAccount = String(params?.to_account || "");
        const quantity = Number(params?.quantity || 0);
        const assetSymbol = String(params?.asset || "").toUpperCase();

        if (!fromAccount || !toAccount || !assetSymbol || quantity <= 0) {
          return res.status(400).json({ error: "Invalid transfer params" });
        }

        const atISO = toISODate(params?.date);
        const note = params?.note ? String(params.note) : undefined;

        const asset: Asset = {
          type:
            assetSymbol === "USD" || assetSymbol.length === 3
              ? "FIAT"
              : "CRYPTO",
          symbol: assetSymbol,
        };

        // Destination asset (for cross-currency)
        const toAssetSymbol = params?.to_asset
          ? String(params.to_asset).toUpperCase()
          : assetSymbol;
        const toAsset: Asset = {
          type:
            toAssetSymbol === "USD" || toAssetSymbol.length === 3
              ? "FIAT"
              : "CRYPTO",
          symbol: toAssetSymbol,
        };

        const toQuantity = params?.to_amount
          ? Number(params.to_amount)
          : quantity; // Default to 1:1 if not specified (will be fixed by rate if same asset, but if different need input or rate)

        // Rates
        const rateFrom = await priceService.getRateUSD(asset, atISO);
        const rateTo = await priceService.getRateUSD(toAsset, atISO);

        const txOut: Transaction = {
          id: uuidv4(),
          type: "TRANSFER_OUT",
          asset,
          amount: quantity,
          createdAt: atISO ?? new Date().toISOString(),
          account: fromAccount,
          note: note
            ? `Transfer to ${toAccount}: ${note}`
            : `Transfer to ${toAccount}`,
          transferId,
          rate: rateFrom,
          usdAmount: quantity * rateFrom.rateUSD,
        } as Transaction;

        const txIn: Transaction = {
          id: uuidv4(),
          type: "TRANSFER_IN",
          asset: toAsset,
          amount: toQuantity,
          createdAt: atISO ?? new Date().toISOString(),
          account: toAccount,
          note: note
            ? `Transfer from ${fromAccount}: ${note}`
            : `Transfer from ${fromAccount}`,
          transferId,
          rate: rateTo,
          usdAmount: toQuantity * rateTo.rateUSD,
        } as Transaction;

        const txs: Transaction[] = [txOut, txIn];

        // Fee?
        const fee = params?.fee ? Number(params.fee) : 0;
        if (fee > 0) {
          // Assuming fee is in source asset unless specified
          // For simplicity, let's assume fee is in source asset for now or verify 'fee_asset'
          // If fee is separate from transfer amount? "Fees treated as operating expenses."
          // Usually fee is deducted from source.
          // Let's create an EXPENSE transaction for the fee.
          const feeTx: Transaction = {
            id: uuidv4(),
            type: "EXPENSE",
            asset,
            amount: fee,
            createdAt: atISO ?? new Date().toISOString(),
            account: fromAccount,
            note: `Transfer fee`,
            transferId,
            rate: rateFrom,
            usdAmount: fee * rateFrom.rateUSD,
          } as Transaction;
          txs.push(feeTx);
          transactionRepository.create(feeTx);
        }

        transactionRepository.create(txOut);
        transactionRepository.create(txIn);

        return res
          .status(201)
          .json({ ok: true, created: txs.length, transactions: txs });
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Invalid action request" });
  }
});
