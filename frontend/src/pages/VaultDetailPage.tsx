import { format, differenceInDays } from 'date-fns';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import QuickBorrowLoanModal from '../components/modals/QuickBorrowLoanModal';
import QuickRepayModal from '../components/modals/QuickRepayModal';
import { TimeSeriesLineChart } from '../components/reports/Charts';
import ManualPricingControl from '../components/tokenized/ManualPricingControl';
import ComboBox from '../components/ui/ComboBox';
import DataTable, { TableColumn } from '../components/ui/DataTable';
import { useToast } from '../components/ui/Toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  vaultApi,
  transactionApi,
  tokenizedVaultApi,
  vaultLedgerApi,
  portfolioApi,
  reportsApi,
  adminApi,
  ApiError,
} from '../services/api';
import { formatCurrency, formatPercentage } from '../utils/currencyFormatter';

type TokenizedVaultAsset = {
  asset: string;
  quantity: string;
  current_market_value: string;
  allocation_percent: string;
  unrealized_pnl: string;
  unrealized_pnl_percent: string;
};

type TokenizedVaultDetails = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  status: string;
  token_symbol: string;
  token_decimals: number;
  total_supply: string;
  total_assets_under_management: string;
  current_share_price: string;
  initial_share_price: string;
  high_watermark?: string;
  is_user_defined_price: boolean;
  manual_price_per_share: string;
  manual_pricing_initial_aum?: string;
  manual_pricing_reference_price?: string;
  price_last_updated_by?: string | null;
  price_last_updated_at?: string | null;
  price_update_notes?: string | null;
  min_deposit_amount: string;
  max_deposit_amount?: string | null;
  min_withdrawal_amount: string;
  is_deposit_allowed: boolean;
  is_withdrawal_allowed: boolean;
  inception_date: string;
  last_updated: string;
  performance_since_inception: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  as_of?: string;
  current_price_usd?: number;
  roi_realtime_percent?: number;
  benchmark_asset?: string;
  benchmark_roi_percent?: number;
  benchmark_apr_percent?: number;
  asset_breakdown?: TokenizedVaultAsset[];
};

const MAX_RETRIES = 3;

const VaultDetailPage: React.FC = () => {
  const { vaultId: _vaultId, vaultName: _vaultName } = useParams<{
    vaultId?: string;
    vaultName?: string;
  }>();
  const vaultId = _vaultId ?? _vaultName ?? '';
  const navigate = useNavigate();
  const { error: showErrorToast, success: showSuccessToast } = useToast();

  const [tokenizedVaultDetails, setTokenizedVaultDetails] =
    useState<TokenizedVaultDetails | null>(null);
  const [showLiveMetrics, setShowLiveMetrics] = useState<boolean>(false);
  const [ledgerHoldings, setLedgerHoldings] = useState<null | {
    total_shares?: string | number;
    total_aum?: string | number;
    share_price?: string | number;
    transaction_count?: number;
    last_transaction_at?: string;
  }>(null);

  type LedgerTransaction = {
    timestamp?: unknown;
    type?: unknown;
    amount_usd?: number;
    shares?: number;
  };

  const [ledgerTransactions, setLedgerTransactions] = useState<
    LedgerTransaction[]
  >([]);

  // Rolling AUM: last valuation AUM + net flows after that valuation
  const rollingAUM = useMemo(() => {
    try {
      if (!Array.isArray(ledgerTransactions) || ledgerTransactions.length === 0)
        return undefined;
      const txs = [...ledgerTransactions]
        .filter((t) => t?.timestamp)
        .sort(
          (a, b) =>
            new Date(
              typeof a.timestamp === 'string'
                ? a.timestamp
                : String(a.timestamp)
            ).getTime() -
            new Date(
              typeof b.timestamp === 'string'
                ? b.timestamp
                : String(b.timestamp)
            ).getTime()
        );
      let lastValIdx = -1;
      for (let i = txs.length - 1; i >= 0; i--) {
        const t = txs[i];
        const typeRaw = t.type;
        const type = typeof typeRaw === 'string' ? typeRaw : '';
        if (type.toUpperCase() === 'VALUATION') {
          lastValIdx = i;
          break;
        }
      }
      if (lastValIdx === -1) return undefined;
      const base = Number(txs[lastValIdx]?.amount_usd ?? NaN);
      if (!isFinite(base)) return undefined;
      let net = 0;
      for (let i = lastValIdx + 1; i < txs.length; i++) {
        const t = txs[i];
        const typeRaw = t.type;
        const type = typeof typeRaw === 'string' ? typeRaw : '';
        const amt = Number(t?.amount_usd ?? 0) || 0;
        if (type.toUpperCase() === 'DEPOSIT') net += amt;
        else if (
          type.toUpperCase() === 'WITHDRAW' ||
          type.toUpperCase() === 'WITHDRAWAL'
        )
          net -= amt;
      }
      return base + net;
    } catch {
      return undefined;
    }
  }, [ledgerTransactions]);

  // Implied share price from valuation + net flows and share issuance since that valuation (flow-neutral)
  const impliedPriceFromLedger = useMemo(() => {
    try {
      if (!Array.isArray(ledgerTransactions) || ledgerTransactions.length === 0)
        return undefined;
      const txs = [...ledgerTransactions]
        .filter((t) => t?.timestamp)
        .sort(
          (a, b) =>
            new Date(
              typeof a.timestamp === 'string'
                ? a.timestamp
                : String(a.timestamp)
            ).getTime() -
            new Date(
              typeof b.timestamp === 'string'
                ? b.timestamp
                : String(b.timestamp)
            ).getTime()
        );
      let lastValIdx = -1;
      for (let i = txs.length - 1; i >= 0; i--) {
        const typeRaw = txs[i].type;
        const type = typeof typeRaw === 'string' ? typeRaw : '';
        if (type.toUpperCase() === 'VALUATION') {
          lastValIdx = i;
          break;
        }
      }
      if (lastValIdx === -1) return undefined;
      const baseUSD = Number(txs[lastValIdx]?.amount_usd ?? NaN);
      if (!isFinite(baseUSD)) return undefined;
      let netUSD = 0;
      let flowShares = 0;
      for (let i = lastValIdx + 1; i < txs.length; i++) {
        const t = txs[i];
        const typeRaw = t?.type;
        const type = typeof typeRaw === 'string' ? typeRaw : '';
        const usd = Number(t?.amount_usd ?? 0) || 0;
        const sh = Number(t?.shares ?? 0) || 0;
        if (type.toUpperCase() === 'DEPOSIT') {
          netUSD += usd;
          flowShares += sh;
        } else if (
          type.toUpperCase() === 'WITHDRAW' ||
          type.toUpperCase() === 'WITHDRAWAL'
        ) {
          netUSD -= usd;
          flowShares -= sh;
        }
      }
      const totalSharesNow = (() => {
        const v = ledgerHoldings?.total_shares as unknown as
          | string
          | number
          | undefined;
        const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
        return isNaN(Number(n)) ? undefined : Number(n);
      })();
      if (!isFinite(totalSharesNow as number)) return undefined;
      const sharesAtVal = (totalSharesNow as number) - flowShares;
      if (!(sharesAtVal > 0)) return undefined;
      const aumNow = baseUSD + netUSD;
      const priceNow = aumNow / (totalSharesNow as number);
      // If base valuation had a different PPS, that's fine; performance calc will use initial price as reference.
      return isFinite(priceNow) && priceNow > 0 ? priceNow : undefined;
    } catch {
      return undefined;
    }
  }, [ledgerTransactions, ledgerHoldings]);
  const [isTokenizedVault, setIsTokenizedVault] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  type VaultHeaderMetrics = {
    aum_usd: number;
    pnl_usd: number;
    roi_percent: number;
    apr_percent: number;
    last_valuation_usd: number;
    net_flow_since_valuation_usd: number;
    deposits_cum_usd: number;
    withdrawals_cum_usd: number;
    as_of: string;
  };
  const [headerMetrics, setHeaderMetrics] = useState<VaultHeaderMetrics | null>(
    null
  );
  const [retryCount, setRetryCount] = useState(0);

  // Time-series for tokenized vault (AUM, PnL, ROI, APR)
  const [vaultSeries, setVaultSeries] = useState<
    Array<{
      date: string;
      aum_usd: number;
      pnl_usd: number;
      roi_percent: number;
      apr_percent: number;
    }>
  >([]);
  const _loadingSeries = useState<boolean>(false)[0];

  // Load per-vault series when viewing a tokenized vault
  useEffect(() => {
    const fetchSeries = async () => {
      if (!isTokenizedVault || !tokenizedVaultDetails?.id) {
        setVaultSeries([]);
        return;
      }
      try {
        const res = await reportsApi.vaultSeries<{
          vault: string;
          series: Array<{
            date: string;
            aum_usd: number;
            pnl_usd: number;
            roi_percent: number;
            apr_percent: number;
          }>;
        }>(tokenizedVaultDetails.id);
        const s = (res as { series?: unknown })?.series ?? [];
        setVaultSeries(Array.isArray(s) ? s : []);
      } catch {
        setVaultSeries([]);
      }
    };
    void fetchSeries();
  }, [isTokenizedVault, tokenizedVaultDetails?.id]);

  // Load header metrics (backend)
  useEffect(() => {
    const fetchHeader = async () => {
      if (!isTokenizedVault || !tokenizedVaultDetails?.id) {
        setHeaderMetrics(null);
        return;
      }
      try {
        const m = await reportsApi.vaultHeader<VaultHeaderMetrics>(
          tokenizedVaultDetails.id
        );
        setHeaderMetrics(m);
      } catch {
        setHeaderMetrics(null);
      }
    };
    void fetchHeader();
  }, [isTokenizedVault, tokenizedVaultDetails?.id]);

  // Borrowings special UI state
  const [borrowingsSummary, setBorrowingsSummary] = useState<null | {
    outstandingUSD: number;
    liabilities: Array<{
      counterparty: string;
      asset: string;
      amount: number;
      valueUSD: number;
    }>;
  }>(null);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [showRepayModal, setShowRepayModal] = useState(false);

  // Tokenized vault deposit/withdraw UI state
  const [showTokenizedDepositForm, setShowTokenizedDepositForm] =
    useState<boolean>(false);
  const [showTokenizedWithdrawForm, setShowTokenizedWithdrawForm] =
    useState<boolean>(false);
  const [tokenizedDepositAmount, setTokenizedDepositAmount] =
    useState<string>('');
  const [tokenizedWithdrawAmount, setTokenizedWithdrawAmount] =
    useState<string>('');
  const [tokenizedNotes, setTokenizedNotes] = useState<string>('');
  const [tokenizedSourceAccount, setTokenizedSourceAccount] =
    useState<string>('');
  const [tokenizedTargetAccount, setTokenizedTargetAccount] =
    useState<string>('');
  const [tokenizedDepositAsset, setTokenizedDepositAsset] =
    useState<string>('USD');
  const [tokenizedWithdrawAsset, setTokenizedWithdrawAsset] =
    useState<string>('USD');

  // Reward payout UI state (mark gain, then distribute to cash)
  const [showRewardForm, setShowRewardForm] = useState<boolean>(false);
  const [rewardAmount, setRewardAmount] = useState<string>('');
  const [rewardDestination, setRewardDestination] = useState<string>('Spend');
  const [rewardNote, setRewardNote] = useState<string>('');
  const [rewardMark, setRewardMark] = useState<boolean>(true);
  const [rewardCreateIncome, setRewardCreateIncome] = useState<boolean>(false);
  const [rewardDate, setRewardDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [assetOptions, setAssetOptions] = useState<
    Array<{ value: string; label: string }>
  >([
    { value: 'USD', label: 'USD' },
    { value: 'BTC', label: 'BTC' },
    { value: 'ETH', label: 'ETH' },
    { value: 'USDT', label: 'USDT' },
    { value: 'USDC', label: 'USDC' },
  ]);

  // All vaults for transfer dropdown
  const [allVaults, setAllVaults] = useState<Array<{ value: string; label: string }>>([]);

  const loadVault = useCallback(async (): Promise<void> => {
    if (!vaultId) {
      setLoading(false);
      return;
    }

    const isTokenizedId = vaultId.startsWith('vault_');

    setLoading(true);
    setError(null);

    let loadedTokenized = false;

    // First: try tokenized vault API
    try {
      const tokenizedData =
        await tokenizedVaultApi.get<TokenizedVaultDetails>(vaultId);
      if (tokenizedData) {
        setTokenizedVaultDetails(tokenizedData);
        setIsTokenizedVault(true);
        // Load ledger data for tokenized vaults
        try {
          const [h, tx] = await Promise.all([
            vaultLedgerApi.holdings<Record<string, unknown>>(vaultId),
            vaultLedgerApi.transactions<Array<Record<string, unknown>>>(
              vaultId,
              { limit: 100 }
            ),
          ]);
          setLedgerHoldings(h ?? null);
          const ppsRaw = h?.share_price;
          const pps =
            typeof ppsRaw === 'string' ? parseFloat(ppsRaw) : (ppsRaw ?? 1);
          const mapped = (Array.isArray(tx) ? tx : []).map(
            (e: Record<string, unknown>) => {
              const usd =
                typeof e?.usdValue === 'string'
                  ? parseFloat(e.usdValue)
                  : Number(e?.usdValue ?? 0);
              const qty =
                typeof e?.amount === 'string'
                  ? parseFloat(e.amount)
                  : Number(e?.amount ?? 0);
              const price = Number(pps) || 1;
              const typeRaw = e?.type;
              const type = typeof typeRaw === 'string' ? typeRaw : '';
              const assetRaw = e?.asset;
              let asset = '';
              if (typeof assetRaw === 'string') {
                asset = assetRaw;
              } else if (typeof assetRaw === 'object' && assetRaw !== null) {
                const symbolRaw = (assetRaw as Record<string, unknown>).symbol;
                asset = typeof symbolRaw === 'string' ? symbolRaw : '';
              }
              return {
                timestamp: e?.at ?? e?.timestamp ?? null,
                type: type.toUpperCase(),
                status: typeof e?.status === 'string' ? e.status : '-',
                amount_usd: isNaN(usd) ? 0 : usd,
                shares: isNaN(usd) ? 0 : usd / price,
                price_per_share: price,
                asset,
                account: (e?.account ?? null) as string | null,
                asset_quantity: isNaN(qty) ? 0 : qty,
              };
            }
          );
          setLedgerTransactions(
            mapped.sort((a, b) => {
              const ta =
                a?.timestamp && typeof a.timestamp === 'string'
                  ? new Date(a.timestamp).getTime()
                  : 0;
              const tb =
                b?.timestamp && typeof b.timestamp === 'string'
                  ? new Date(b.timestamp).getTime()
                  : 0;
              return tb - ta; // latest first
            })
          );
        } catch (_e) {
          // ignore
          console.warn('Failed to load ledger data');
          setLedgerHoldings(null);
          setLedgerTransactions([]);
        }
        loadedTokenized = true;
        setRetryCount(0);
      }
    } catch (err) {
      const apiErr = err as ApiError;
      // If route param looks like a tokenized ID and backend says 404, stop here with a clear error
      if (
        apiErr instanceof ApiError &&
        apiErr.status === 404 &&
        isTokenizedId
      ) {
        setError('Tokenized vault not found');
        setLoading(false);
        return;
      }
      // For other errors, retry a few times then surface error
      if (!(apiErr instanceof ApiError && apiErr.status === 404)) {
        if (retryCount < MAX_RETRIES) {
          setTimeout(
            () => setRetryCount(retryCount + 1),
            1000 * (retryCount + 1)
          );
        } else {
          const message =
            apiErr instanceof Error ? apiErr.message : 'Failed to load vault';
          setError(message);
          showErrorToast('Failed to load vault details after multiple retries');
          setLoading(false);
        }
        return;
      }
    }

    if (loadedTokenized) {
      setLoading(false);
      return;
    }

    // Only tokenized vaults are supported
    setError('Tokenized vault not found');
    setLoading(false);
  }, [vaultId, showErrorToast, retryCount]);

  const loadAssets = async (): Promise<void> => {
    try {
      const assetsData = await adminApi.listAssets();
      const assetList = (assetsData ?? []) as Array<{
        symbol?: string;
        name?: string;
      }>;
      const options = assetList.map((a) => {
        const symbol = String(a.symbol ?? '');
        const name = String(a.name ?? symbol);
        return { value: symbol, label: `${symbol} - ${name}` };
      });
      setAssetOptions(options);
    } catch {
      // Keep default assets if loading fails
      setAssetOptions([
        { value: 'USD', label: 'USD - U.S. Dollar' },
        { value: 'BTC', label: 'BTC - Bitcoin' },
        { value: 'ETH', label: 'ETH - Ethereum' },
        { value: 'USDT', label: 'USDT - Tether' },
        { value: 'USDC', label: 'USDC - USD Coin' },
      ]);
    }
  };

  const handleTokenizedDelete = async (): Promise<void> => {
    if (!tokenizedVaultDetails) return;
    if (
      !confirm(
        'Delete this tokenized vault permanently? This action cannot be undone.'
      )
    ) {
      return;
    }
    try {
      await tokenizedVaultApi.delete(tokenizedVaultDetails.id);
      showSuccessToast('Vault deleted successfully!');
      navigate('/vaults');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete vault';
      showErrorToast(message);
    }
  };

  const handleTokenizedClose = async (): Promise<void> => {
    if (!tokenizedVaultDetails) return;
    if (
      !confirm(
        'Close this vault? This marks the vault as closed but keeps historical data.'
      )
    ) {
      return;
    }
    try {
      await tokenizedVaultApi.close(tokenizedVaultDetails.id);
      showSuccessToast('Vault closed successfully!');
      await loadVault();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to close vault';
      showErrorToast(message);
    }
  };

  const handleTokenizedMetricsUpdate = (metrics: {
    price: number;
    totalValue: number;
  }): void => {
    setTokenizedVaultDetails((prev) =>
      prev
        ? {
            ...prev,
            current_share_price: metrics.price.toString(),
            manual_price_per_share: metrics.price.toString(),
            total_assets_under_management: metrics.totalValue.toString(),
          }
        : prev
    );
    void loadVault();
  };

  const handleTokenizedPricingModeChange = (isManual: boolean): void => {
    setTokenizedVaultDetails((prev) =>
      prev
        ? {
            ...prev,
            is_user_defined_price: isManual,
          }
        : prev
    );
    void loadVault();
  };

  const handleTokenizedDeposit = async (): Promise<void> => {
    if (!tokenizedVaultDetails) return;
    const amount = parseFloat(tokenizedDepositAmount ?? '');
    if (!amount || amount <= 0) {
      showErrorToast('Enter a valid amount to deposit');
      return;
    }
    const minDep = parseFloat(tokenizedVaultDetails.min_deposit_amount || '0');
    if (minDep && amount < minDep) {
      showErrorToast(`Minimum deposit is ${formatCurrency(minDep)}`);
      return;
    }
    try {
      await tokenizedVaultApi.deposit(tokenizedVaultDetails.id, {
        amount,
        notes: tokenizedNotes || undefined,
        source_account: tokenizedSourceAccount || undefined,
        asset: tokenizedDepositAsset || 'USD',
      });
      showSuccessToast('Deposit recorded');
      setShowTokenizedDepositForm(false);
      setTokenizedDepositAmount('');
      setTokenizedNotes('');
      setTokenizedSourceAccount('');
      setTokenizedDepositAsset('USD');
      await loadVault();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to deposit to vault';
      showErrorToast(message);
    }
  };

  const handleTokenizedWithdraw = async (): Promise<void> => {
    if (!tokenizedVaultDetails) return;
    const amount = parseFloat(tokenizedWithdrawAmount ?? '');
    if (!amount || amount <= 0) {
      showErrorToast('Enter a valid amount to withdraw');
      return;
    }
    const minW = parseFloat(tokenizedVaultDetails.min_withdrawal_amount || '0');
    if (minW && amount < minW) {
      showErrorToast(`Minimum withdrawal is ${formatCurrency(minW)}`);
      return;
    }
    try {
      await tokenizedVaultApi.withdraw(tokenizedVaultDetails.id, {
        amount,
        notes: tokenizedNotes || undefined,
        asset: tokenizedWithdrawAsset || 'USD',
      });
      // Also reflect on Transactions if a target account was provided
      if (tokenizedTargetAccount) {
        await transactionApi.create({
          date: new Date().toISOString(),
          type: 'withdraw',
          asset: tokenizedWithdrawAsset || 'USD',
          account: tokenizedTargetAccount,
          quantity: amount,
          price_local: 1,
          counterparty: `Tokenized ${tokenizedVaultDetails.id}`,
          note: tokenizedNotes || null,
          fx_to_usd: 1,
          fx_to_vnd: 0,
        });
      }
      showSuccessToast('Withdrawal recorded');
      setShowTokenizedWithdrawForm(false);
      setTokenizedWithdrawAmount('');
      setTokenizedNotes('');
      setTokenizedWithdrawAsset('USD');
      await loadVault();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to withdraw from vault';
      showErrorToast(message);
    }
  };

  useEffect(() => {
    if (vaultId) {
      void loadVault();
      void loadAssets();
    }
  }, [vaultId, loadVault]);

  // Load all vaults for the transfer dropdown
  useEffect(() => {
    const fetchAllVaults = async () => {
      try {
        const vaultsData = await tokenizedVaultApi.list<{
          id: string;
          name: string;
          status: string;
        }>();
        const vaults = Array.isArray(vaultsData)
          ? vaultsData
              .filter((v) => v.status === 'active' && v.id !== vaultId)
              .map((v) => ({
                value: v.id,
                label: v.name,
              }))
          : [];
        setAllVaults(vaults);
      } catch (err) {
        console.error('Failed to load vaults list:', err);
        setAllVaults([]);
      }
    };
    void fetchAllVaults();
  }, [vaultId]);

  // Load Borrowings summary when viewing the Borrowings vault
  useEffect(() => {
    const fetchBorrowings = async () => {
      try {
        const isBorrowings = isTokenizedVault
          ? String(tokenizedVaultDetails?.name ?? '').toLowerCase() ===
            'borrowings'
          : vaultId.toLowerCase() === 'borrowings';
        if (!isBorrowings) {
          setBorrowingsSummary(null);
          return;
        }
        const r = await portfolioApi.report<Record<string, unknown>>();
        const liabs = Array.isArray(r?.liabilities) ? r.liabilities : [];
        const mapped = liabs.map((o: Record<string, unknown>) => {
          const counterpartyRaw = o?.counterparty;
          const counterparty =
            typeof counterpartyRaw === 'string' ? counterpartyRaw : '';
          const assetRaw = o?.asset;
          let asset = '';
          if (typeof assetRaw === 'string') {
            asset = assetRaw;
          } else if (typeof assetRaw === 'object' && assetRaw !== null) {
            const symbolRaw = (assetRaw as Record<string, unknown>).symbol;
            asset = typeof symbolRaw === 'string' ? symbolRaw : '';
          }
          return {
            counterparty,
            asset,
            amount: Number(o?.amount ?? 0),
            valueUSD: Number(o?.valueUSD ?? 0),
          };
        });
        const outstandingUSD = mapped.reduce(
          (s: number, x: { valueUSD?: number }) =>
            s + (Number(x.valueUSD) || 0),
          0
        );
        setBorrowingsSummary({ outstandingUSD, liabilities: mapped });
      } catch (_e) {
        setBorrowingsSummary(null);
      }
    };
    void fetchBorrowings();
  }, [isTokenizedVault, tokenizedVaultDetails, vaultId]);

  const toISODateTime = (value?: string): string => {
    if (!value) return new Date().toISOString();
    const s = String(value);
    if (s.includes('T')) return s;
    const timePart = new Date().toISOString().split('T')[1];
    return `${s}T${timePart}`;
  };

  const isValidDate = (d: Date) =>
    d instanceof Date && !isNaN(d.getTime()) && d.getFullYear() > 1900;

  const handleDistributeReward = async (): Promise<void> => {
    const amt = parseFloat(rewardAmount ?? '');
    if (!(amt > 0)) {
      showErrorToast('Enter a valid reward amount');
      return;
    }
    try {
      const targetName = isTokenizedVault
        ? (tokenizedVaultDetails?.id ?? vaultId)
        : vaultId;
      await vaultApi.distributeReward(targetName, {
        amount: amt,
        destination: rewardDestination || 'Spend',
        date: toISODateTime(rewardDate),
        note: rewardNote || undefined,
        mark: rewardMark,
        create_income: rewardCreateIncome,
      });
      showSuccessToast('Reward distributed');
      setShowRewardForm(false);
      setRewardAmount('');
      setRewardNote('');
      await loadVault();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to distribute reward';
      showErrorToast(message);
    }
  };

  const formatVaultNumber = (
    value: string | number,
    decimals: number = 2
  ): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const tokenizedAssetColumns: TableColumn<TokenizedVaultAsset>[] = [
    {
      key: 'asset',
      title: 'Asset',
    },
    {
      key: 'quantity',
      title: 'Quantity',
      type: 'number',
      decimals: 6,
      render: (value) => {
        const num =
          typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
        return isNaN(num)
          ? '0'
          : num.toLocaleString(undefined, { maximumFractionDigits: 6 });
      },
    },
    {
      key: 'current_market_value',
      title: 'Market Value',
      type: 'currency',
      currency: 'USD',
      render: (value) =>
        formatCurrency(
          typeof value === 'string' ? parseFloat(value) : Number(value ?? 0)
        ),
    },
    {
      key: 'allocation_percent',
      title: 'Allocation',
      render: (value) => {
        const num =
          typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
        return isNaN(num) ? '0.00%' : `${num.toFixed(2)}%`;
      },
    },
    {
      key: 'unrealized_pnl',
      title: 'Unrealized P&L',
      type: 'currency',
      currency: 'USD',
      render: (value) =>
        formatCurrency(
          typeof value === 'string' ? parseFloat(value) : Number(value ?? 0)
        ),
    },
    {
      key: 'unrealized_pnl_percent',
      title: 'PnL %',
      render: (value) => {
        const num =
          typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
        return isNaN(num) ? '0.00%' : `${num.toFixed(2)}%`;
      },
    },
  ];

  const isUsdOnlyVault = useMemo(() => {
    return false; // This appears to be unused legacy code
  }, []);

  // Whether the current vault represents the special Borrowings view
  const isBorrowings = useMemo(() => {
    return (
      String(tokenizedVaultDetails?.name ?? '').toLowerCase() === 'borrowings'
    );
  }, [tokenizedVaultDetails]);

  // Whether the current vault represents the special Spend view
  const isSpend = useMemo(() => {
    return String(tokenizedVaultDetails?.name ?? '').toLowerCase() === 'spend';
  }, [tokenizedVaultDetails]);

  // Helpers and handlers for Borrowings quick actions
  const toAssetObj = (symbol: string) => ({
    type:
      symbol.toUpperCase() === 'USD' || symbol.length === 3
        ? ('FIAT' as const)
        : ('CRYPTO' as const),
    symbol: symbol.toUpperCase(),
  });

  const _refreshBorrowingsExternal = useCallback(async () => {
    try {
      const r = await portfolioApi.report<Record<string, unknown>>();
      const liabs = Array.isArray(r?.liabilities) ? r.liabilities : [];
      const mapped = liabs.map((o: Record<string, unknown>) => {
        const counterpartyRaw = o?.counterparty;
        const counterparty =
          typeof counterpartyRaw === 'string' ? counterpartyRaw : '';
        const assetRaw = o?.asset;
        let asset = '';
        if (typeof assetRaw === 'string') {
          asset = assetRaw;
        } else if (typeof assetRaw === 'object' && assetRaw !== null) {
          const symbolRaw = (assetRaw as Record<string, unknown>).symbol;
          asset = typeof symbolRaw === 'string' ? symbolRaw : '';
        }
        return {
          counterparty,
          asset,
          amount: Number(o?.amount ?? 0),
          valueUSD: Number(o?.valueUSD ?? 0),
        };
      });
      const outstandingUSD = mapped.reduce(
        (s: number, x: { valueUSD?: number }) => s + (Number(x.valueUSD) || 0),
        0
      );
      setBorrowingsSummary({ outstandingUSD, liabilities: mapped });
    } catch {
      // ignore
    }
  }, []);

  const handleBorrowSubmit = useCallback(
    async (d: {
      date: string;
      amount: number;
      account?: string;
      asset: string;
      counterparty?: string;
      note?: string;
    }) => {
      await transactionApi.borrow({
        asset: toAssetObj(d.asset),
        amount: Number(d.amount),
        account: d.account ?? undefined,
        counterparty: d.counterparty ?? 'general',
        note: d.note ?? undefined,
        at: d.date,
      } as {
        asset: { symbol?: string };
        amount: number;
        account?: string;
        counterparty: string;
        note?: string;
        at: string;
      });
      await loadVault();
      await _refreshBorrowingsExternal();
      setShowBorrowModal(false);
    },
    [loadVault, _refreshBorrowingsExternal]
  );

  const handleRepaySubmit = useCallback(
    async (d: {
      date: string;
      amount: number;
      account?: string;
      asset: string;
      counterparty?: string;
      note?: string;
      direction: 'BORROW' | 'LOAN';
    }) => {
      await transactionApi.repay({
        asset: toAssetObj(d.asset),
        amount: Number(d.amount),
        account: d.account ?? undefined,
        counterparty: d.counterparty ?? 'general',
        note: d.note ?? undefined,
        direction: 'BORROW',
        at: d.date,
      } as {
        asset: { symbol?: string };
        amount: number;
        account?: string;
        counterparty: string;
        note?: string;
        direction: string;
        at: string;
      });
      await loadVault();
      await _refreshBorrowingsExternal();
      setShowRepayModal(false);
    },
    [loadVault, _refreshBorrowingsExternal]
  );
  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>

        {/* Borrow/Repay modals for Borrowings */}
        {isBorrowings && (
          <>
            <QuickBorrowLoanModal
              isOpen={showBorrowModal}
              mode="borrow"
              onClose={() => setShowBorrowModal(false)}
              onSubmit={async (d) => {
                await handleBorrowSubmit(d);
              }}
            />
            <QuickRepayModal
              isOpen={showRepayModal}
              onClose={() => setShowRepayModal(false)}
              onSubmit={async (d) => {
                await handleRepaySubmit(d);
              }}
            />
          </>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            Vault Not Found
          </h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={() => navigate('/vaults')}>Back to Vaults</Button>
        </div>
      </div>
    );
  }

  if (isTokenizedVault && tokenizedVaultDetails) {
    const tokenPrice = parseFloat(
      tokenizedVaultDetails.current_share_price ?? '0'
    );
    const totalSupply = parseFloat(tokenizedVaultDetails.total_supply ?? '0');
    const totalValue = parseFloat(
      tokenizedVaultDetails.total_assets_under_management ?? '0'
    );

    // Derive performance from price; when in manual pricing, prefer implied price from rolling AUM to avoid misleading negatives
    const initialPrice = parseFloat(
      tokenizedVaultDetails.initial_share_price ?? '0'
    );
    const perfFromBackend = parseFloat(
      tokenizedVaultDetails.performance_since_inception ?? ''
    );

    // Prefer implied price from valuation+flows so we reflect true gains (e.g., +$5) even if manual price is unchanged
    const priceForPerf = Number.isFinite(impliedPriceFromLedger as number)
      ? (impliedPriceFromLedger as number)
      : Number.isFinite(tokenPrice)
        ? tokenPrice
        : initialPrice;

    const referencePrice =
      isFinite(initialPrice) && initialPrice > 0 ? initialPrice : 1;

    const perfFromPrice =
      isFinite(referencePrice) &&
      referencePrice > 0 &&
      isFinite(priceForPerf) &&
      priceForPerf > 0
        ? (priceForPerf / referencePrice - 1) * 100
        : NaN;

    const inceptionDate = new Date(tokenizedVaultDetails.inception_date);
    const asOfDate = tokenizedVaultDetails.as_of
      ? new Date(tokenizedVaultDetails.as_of)
      : new Date();
    // Check for invalid dates (e.g., SQL minimum date "0001-01-01")
    const safeInceptionDate = isValidDate(inceptionDate)
      ? inceptionDate
      : new Date();
    const safeAsOfDate = isValidDate(asOfDate) ? asOfDate : new Date();
    const daysSinceInception = Math.max(
      1,
      differenceInDays(safeAsOfDate, safeInceptionDate)
    );
    const yearsSinceInception = daysSinceInception / 365.25;

    // Performance for header should be price-based to avoid flow artifacts (use implied price when available)
    const perfRaw = Number.isFinite(perfFromPrice)
      ? perfFromPrice
      : Number.isFinite(perfFromBackend)
        ? perfFromBackend
        : 0;
    const EPS = 0.01; // ignore +/- 1bp noise
    const performance = Math.abs(perfRaw) < EPS ? 0 : perfRaw;

    // APR derived from price-based performance; avoid over-annualizing short histories (< 30 days)
    const roiDecimal = (performance || 0) / 100;
    const aprSinceInception =
      daysSinceInception >= 30 && yearsSinceInception > 0
        ? (Math.pow(1 + roiDecimal, 1 / yearsSinceInception) - 1) * 100
        : performance;
    const perfDisplay =
      typeof headerMetrics?.roi_percent === 'number' &&
      isFinite(headerMetrics.roi_percent)
        ? headerMetrics.roi_percent
        : performance;
    const aprDisplay =
      typeof headerMetrics?.apr_percent === 'number' &&
      isFinite(headerMetrics.apr_percent)
        ? headerMetrics.apr_percent
        : aprSinceInception;
    const status = tokenizedVaultDetails.status?.toLowerCase() ?? 'unknown';
    const statusConfig: Record<string, { label: string; className: string }> = {
      active: { label: 'Active', className: 'bg-green-100 text-green-800' },
      paused: { label: 'Paused', className: 'bg-yellow-100 text-yellow-800' },
      closed: { label: 'Closed', className: 'bg-gray-100 text-gray-800' },
      liquidating: {
        label: 'Liquidating',
        className: 'bg-red-100 text-red-800',
      },
    };
    const statusBadge = statusConfig[status] ?? {
      label: status,
      className: 'bg-gray-100 text-gray-800',
    };
    const isBorrowings =
      (tokenizedVaultDetails.name ?? '').toLowerCase() === 'borrowings';

    const canDeposit =
      tokenizedVaultDetails.status === 'active' &&
      tokenizedVaultDetails.is_deposit_allowed;
    const canWithdraw =
      tokenizedVaultDetails.status === 'active' &&
      tokenizedVaultDetails.is_withdrawal_allowed;

    const toAssetObj = (symbol: string) => ({
      type:
        symbol.toUpperCase() === 'USD' || symbol.length === 3
          ? ('FIAT' as const)
          : ('CRYPTO' as const),
      symbol: symbol.toUpperCase(),
    });
    const _refreshBorrowings = async () => {
      try {
        const r = await portfolioApi.report<Record<string, unknown>>();
        const liabs = Array.isArray(r?.liabilities) ? r.liabilities : [];
        const mapped = liabs.map((o: Record<string, unknown>) => {
          const counterpartyRaw = o?.counterparty;
          const counterparty =
            typeof counterpartyRaw === 'string' ? counterpartyRaw : '';
          const assetRaw = o?.asset;
          let asset = '';
          if (typeof assetRaw === 'string') {
            asset = assetRaw;
          } else if (typeof assetRaw === 'object' && assetRaw !== null) {
            const symbolRaw = (assetRaw as Record<string, unknown>).symbol;
            asset = typeof symbolRaw === 'string' ? symbolRaw : '';
          }
          return {
            counterparty,
            asset,
            amount: Number(o?.amount ?? 0),
            valueUSD: Number(o?.valueUSD ?? 0),
          };
        });
        const outstandingUSD = mapped.reduce(
          (s: number, x: { valueUSD?: number }) =>
            s + (Number(x.valueUSD) || 0),
          0
        );
        setBorrowingsSummary({ outstandingUSD, liabilities: mapped });
      } catch {
        // ignore
      }
    };

    const _handleBorrowSubmit = async (d: {
      date: string;
      amount: number;
      account?: string;
      asset: string;
      counterparty?: string;
      note?: string;
    }) => {
      await transactionApi.borrow({
        asset: toAssetObj(d.asset),
        amount: Number(d.amount),
        account: d.account ?? undefined,
        counterparty: d.counterparty ?? 'general',
        note: d.note ?? undefined,
        at: d.date,
      } as {
        asset: { symbol?: string };
        amount: number;
        account?: string;
        counterparty: string;
        note?: string;
        at: string;
      });
      await loadVault();
      await _refreshBorrowings();
      setShowBorrowModal(false);
    };

    return (
      <div
        className="px-4 py-6 sm:px-0"
        data-testid="tokenized-vault-detail-page"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Button
              onClick={() => navigate('/vaults')}
              variant="link"
              className="mb-4 px-0"
            >
              ← Back to Vaults
            </Button>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              {tokenizedVaultDetails.name} ({tokenizedVaultDetails.token_symbol}
              )
            </h1>
            <p className="text-gray-600">
              {tokenizedVaultDetails.description ?? 'Tokenized vault overview'}
            </p>
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
        </div>

        {/* Borrowings special summary */}
        {isBorrowings && (
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-lg font-semibold">
                Borrowings Overview
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setShowBorrowModal(true);
                    setShowRepayModal(false);
                  }}
                  variant="destructive"
                  size="sm"
                >
                  Borrow
                </Button>
                <Button
                  onClick={() => {
                    setShowRepayModal(true);
                    setShowBorrowModal(false);
                  }}
                  size="sm"
                >
                  Repay
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-gray-500 text-sm">
                    Outstanding Balance
                  </div>
                  <div className="text-2xl font-bold text-red-700">
                    {formatCurrency(
                      Math.abs(borrowingsSummary?.outstandingUSD ?? 0)
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Liability</div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Entries</div>
                  <div className="text-xl font-semibold">
                    {borrowingsSummary?.liabilities?.length ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Updated</div>
                  <div className="text-sm">{new Date().toLocaleString()}</div>
                </div>
              </div>
              {borrowingsSummary &&
                borrowingsSummary.liabilities.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600">
                          <th className="py-2 pr-4">Counterparty</th>
                          <th className="py-2 pr-4">Asset</th>
                          <th className="py-2 pr-4">Amount</th>
                          <th className="py-2 pr-4">Value (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {borrowingsSummary.liabilities.map((o, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="py-2 pr-4">
                              {o.counterparty || 'general'}
                            </td>
                            <td className="py-2 pr-4">{o.asset}</td>
                            <td className="py-2 pr-4">
                              {Number(o.amount).toLocaleString(undefined, {
                                maximumFractionDigits: 6,
                              })}
                            </td>
                            <td className="py-2 pr-4">
                              {formatCurrency(o.valueUSD)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {/* Spend Vault Summary */}
        {isSpend && !isBorrowings && (
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-lg font-semibold">
                💰 Spend Account Overview
              </CardTitle>
              <span className="text-xs text-gray-500">Cash Tracking</span>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-gray-500 text-sm">Current Balance</div>
                  <div className="text-2xl font-bold text-green-700">
                    {formatCurrency(headerMetrics?.aum_usd ?? 0)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Available to spend
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Total Income</div>
                  <div className="text-xl font-semibold">
                    {formatCurrency(headerMetrics?.deposits_cum_usd ?? 0)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">All deposits</div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Total Spent</div>
                  <div className="text-xl font-semibold text-red-600">
                    {formatCurrency(headerMetrics?.withdrawals_cum_usd ?? 0)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    All withdrawals
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>Simple Balance Tracking:</strong> Income - Expenses =
                  Current Balance
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  No P&amp;L or ROI calculations for this account (it&apos;s
                  cash, not an investment)
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isBorrowings && !isSpend && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Token Price
                  </h3>
                  <p className="text-2xl font-bold text-gray-900">
                    ${isNaN(tokenPrice) ? '0.0000' : tokenPrice.toFixed(4)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {tokenizedVaultDetails.is_user_defined_price
                      ? 'Manual price'
                      : 'Live price'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Total Supply
                  </h3>
                  <p className="text-2xl font-bold text-gray-900">
                    {isNaN(totalSupply)
                      ? '0'
                      : totalSupply.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                  </p>
                  <p className="text-sm text-gray-600">Tokens issued</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Assets Under Management
                  </h3>
                  <p className="text-2xl font-bold text-gray-900">
                    {(() => {
                      const base = isNaN(totalValue) ? 0 : totalValue;
                      const roll =
                        typeof rollingAUM === 'number' && isFinite(rollingAUM)
                          ? rollingAUM
                          : undefined;
                      const backend =
                        typeof headerMetrics?.aum_usd === 'number' &&
                        isFinite(headerMetrics.aum_usd)
                          ? headerMetrics.aum_usd
                          : undefined;
                      return formatCurrency(backend ?? roll ?? base);
                    })()}
                  </p>
                  <p className="text-sm text-gray-600">
                    {(() => {
                      if (tokenizedVaultDetails.is_user_defined_price)
                        return 'Manual pricing';
                      return typeof headerMetrics?.aum_usd === 'number' &&
                        isFinite(headerMetrics.aum_usd)
                        ? 'Backend rolling AUM'
                        : typeof rollingAUM === 'number' && isFinite(rollingAUM)
                          ? 'Rolling since last valuation'
                          : 'Total vault value';
                    })()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Performance Since Inception
                  </h3>
                  <p
                    className={`text-2xl font-bold ${perfDisplay >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {formatPercentage((perfDisplay || 0) / 100, 2)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Relative to initial share price
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    APR Since Inception
                  </h3>
                  <p
                    className={`text-2xl font-bold ${aprDisplay >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {formatPercentage((aprDisplay || 0) / 100, 2)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Annualized from inception
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Time Series: APR and PnL over time */}
            {vaultSeries.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      PnL Over Time
                    </h3>
                    <div style={{ height: 280 }}>
                      <TimeSeriesLineChart
                        labels={vaultSeries.map((p) => p.date)}
                        datasets={[
                          {
                            label: 'PnL (USD)',
                            data: vaultSeries.map((p) => p.pnl_usd),
                            color: '#059669',
                            fill: true,
                          },
                        ]}
                        yFormat="currency"
                        currency="USD"
                      />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      APR Over Time
                    </h3>
                    <div style={{ height: 280 }}>
                      <TimeSeriesLineChart
                        labels={vaultSeries.map((p) => p.date)}
                        datasets={[
                          {
                            label: 'APR (%)',
                            data: vaultSeries.map((p) => p.apr_percent),
                            color: '#2563EB',
                            fill: true,
                          },
                        ]}
                        yFormat="percent"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <ManualPricingControl
                vaultId={tokenizedVaultDetails.id}
                currentPrice={isNaN(tokenPrice) ? 0 : tokenPrice}
                currentTotalValue={
                  typeof rollingAUM === 'number' && isFinite(rollingAUM)
                    ? rollingAUM
                    : isNaN(totalValue)
                      ? 0
                      : totalValue
                }
                totalSupply={isNaN(totalSupply) ? 0 : totalSupply}
                isManualPricing={tokenizedVaultDetails.is_user_defined_price}
                onMetricsUpdate={handleTokenizedMetricsUpdate}
                onPricingModeChange={handleTokenizedPricingModeChange}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Vault Configuration
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500">Inception Date</dt>
                  <dd className="text-gray-900">
                    {isValidDate(new Date(tokenizedVaultDetails.inception_date))
                      ? format(
                          new Date(tokenizedVaultDetails.inception_date),
                          'MMM d, yyyy'
                        )
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Last Updated</dt>
                  <dd className="text-gray-900">
                    {isValidDate(new Date(tokenizedVaultDetails.last_updated))
                      ? format(
                          new Date(tokenizedVaultDetails.last_updated),
                          'MMM d, yyyy HH:mm'
                        )
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Created By</dt>
                  <dd className="text-gray-900">
                    {tokenizedVaultDetails.created_by}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Price Last Updated</dt>
                  <dd className="text-gray-900">
                    {tokenizedVaultDetails.price_last_updated_at &&
                    isValidDate(
                      new Date(tokenizedVaultDetails.price_last_updated_at)
                    )
                      ? format(
                          new Date(tokenizedVaultDetails.price_last_updated_at),
                          'MMM d, yyyy HH:mm'
                        )
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Min Deposit</dt>
                  <dd className="text-gray-900">
                    {formatCurrency(
                      parseFloat(
                        tokenizedVaultDetails.min_deposit_amount ?? '0'
                      )
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Min Withdrawal</dt>
                  <dd className="text-gray-900">
                    {formatCurrency(
                      parseFloat(
                        tokenizedVaultDetails.min_withdrawal_amount ?? '0'
                      )
                    )}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          {tokenizedVaultDetails.status === 'active' && (
            <Button
              onClick={() => {
                void handleTokenizedClose();
              }}
              variant="destructive"
            >
              Close Vault
            </Button>
          )}
          <Button
            onClick={() => {
              void handleTokenizedDelete();
            }}
            variant="secondary"
          >
            Delete Vault
          </Button>
          <Button
            onClick={() => setShowLiveMetrics((s) => !s)}
            variant="outline"
          >
            {showLiveMetrics ? 'Hide Asset Breakdown' : 'Show Asset Breakdown'}
          </Button>
          <Button
            onClick={() => {
              void loadVault();
            }}
          >
            Refresh
          </Button>
          {canDeposit && (
            <Button
              onClick={() => {
                setShowTokenizedDepositForm((s) => !s);
                setShowTokenizedWithdrawForm(false);
              }}
              variant="default"
            >
              Deposit
            </Button>
          )}
          {canWithdraw && (
            <Button
              onClick={() => {
                setShowTokenizedWithdrawForm((s) => !s);
                setShowTokenizedDepositForm(false);
              }}
            >
              Withdraw
            </Button>
          )}
          <Button
            onClick={() => {
              setShowRewardForm((s) => !s);
              setShowTokenizedDepositForm(false);
              setShowTokenizedWithdrawForm(false);
            }}
            variant="default"
            className="bg-purple-600 hover:bg-purple-700"
          >
            Distribute Reward
          </Button>
        </div>

        {(showTokenizedDepositForm || showTokenizedWithdrawForm) && (
          <Card className="mb-6">
            <CardHeader>
              <h3 className="text-lg font-semibold mb-4">
                {showTokenizedDepositForm
                  ? 'Deposit to Vault'
                  : 'Withdraw from Vault'}
              </h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Asset
                  </label>
                  <ComboBox
                    options={assetOptions}
                    value={
                      showTokenizedDepositForm
                        ? tokenizedDepositAsset
                        : tokenizedWithdrawAsset
                    }
                    onChange={(value) => {
                      if (showTokenizedDepositForm) {
                        setTokenizedDepositAsset(String(value));
                      } else {
                        setTokenizedWithdrawAsset(String(value));
                      }
                    }}
                    placeholder="Asset"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={
                      showTokenizedDepositForm
                        ? tokenizedDepositAmount
                        : tokenizedWithdrawAmount
                    }
                    onChange={(e) =>
                      showTokenizedDepositForm
                        ? setTokenizedDepositAmount(e.target.value)
                        : setTokenizedWithdrawAmount(e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder={
                      showTokenizedDepositForm
                        ? tokenizedVaultDetails.min_deposit_amount
                        : tokenizedVaultDetails.min_withdrawal_amount
                    }
                  />
                </div>

                {!showTokenizedDepositForm && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Target Vault (optional)
                    </label>
                    <ComboBox
                      options={allVaults}
                      value={tokenizedTargetAccount}
                      onChange={(v) => setTokenizedTargetAccount(String(v))}
                      placeholder="Choose vault to transfer to"
                    />
                  </div>
                )}
              </div>
              <div className="flex space-x-3">
                {showTokenizedDepositForm ? (
                  <Button
                    onClick={() => {
                      void handleTokenizedDeposit();
                    }}
                  >
                    Deposit
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      void handleTokenizedWithdraw();
                    }}
                  >
                    Withdraw
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setShowTokenizedDepositForm(false);
                    setShowTokenizedWithdrawForm(false);
                    setTokenizedNotes('');
                  }}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showRewardForm && (
          <Card className="mb-6">
            <CardHeader>
              <h3 className="text-lg font-semibold mb-4">Distribute Reward</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reward (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Destination Vault
                  </label>
                  <input
                    type="text"
                    value={rewardDestination}
                    onChange={(e) => setRewardDestination(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Spend"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={rewardDate}
                    onChange={(e) => setRewardDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Note (optional)
                  </label>
                  <input
                    type="text"
                    value={rewardNote}
                    onChange={(e) => setRewardNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="e.g., Weekly rewards"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={rewardMark}
                    onChange={(e) => setRewardMark(e.target.checked)}
                  />
                  Mark valuation before payout
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={rewardCreateIncome}
                    onChange={(e) => setRewardCreateIncome(e.target.checked)}
                  />
                  Also create INCOME entry in destination
                </label>
              </div>
              <div className="flex space-x-3">
                <Button
                  onClick={() => {
                    void handleDistributeReward();
                  }}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Distribute
                </Button>
                <Button
                  onClick={() => {
                    setShowRewardForm(false);
                    setRewardAmount('');
                    setRewardNote('');
                  }}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {tokenizedVaultDetails.asset_breakdown &&
          tokenizedVaultDetails.asset_breakdown.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h2 className="text-xl font-semibold mb-4">Asset Breakdown</h2>
                <DataTable<TokenizedVaultAsset>
                  data={tokenizedVaultDetails.asset_breakdown}
                  columns={tokenizedAssetColumns}
                  loading={false}
                  error={null}
                  emptyMessage="No assets tracked for this vault"
                  editable={false}
                  selectableRows={false}
                  data-testid="tokenized-vault-assets-table"
                />
              </CardContent>
            </Card>
          )}

        {/* Ledger-derived holdings and transaction history */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          <Card className="lg:col-span-1">
            <CardContent className="p-4">
              <h2 className="text-lg font-semibold mb-3">Ledger Holdings</h2>
              {ledgerHoldings ? (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-gray-500">Total Shares</dt>
                    <dd className="text-gray-900">
                      {(() => {
                        const v = ledgerHoldings.total_shares as unknown as
                          | string
                          | number
                          | undefined;
                        const n =
                          typeof v === 'string' ? parseFloat(v) : (v ?? 0);
                        return isNaN(Number(n))
                          ? '0'
                          : Number(n).toLocaleString(undefined, {
                              maximumFractionDigits: 6,
                            });
                      })()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Total AUM</dt>
                    <dd className="text-gray-900">
                      {(() => {
                        const v = ledgerHoldings.total_aum as unknown as
                          | string
                          | number
                          | undefined;
                        const n =
                          typeof v === 'string' ? parseFloat(v) : (v ?? 0);
                        const base = isNaN(Number(n)) ? 0 : Number(n);
                        const display =
                          typeof rollingAUM === 'number' && isFinite(rollingAUM)
                            ? rollingAUM
                            : base;
                        return formatCurrency(display);
                      })()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Share Price</dt>
                    <dd className="text-gray-900">
                      {(() => {
                        const v = ledgerHoldings.share_price as unknown as
                          | string
                          | number
                          | undefined;
                        const n =
                          typeof v === 'string' ? parseFloat(v) : (v ?? 0);
                        return `${isNaN(Number(n)) ? '0.0000' : Number(n).toFixed(4)}`;
                      })()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Transactions</dt>
                    <dd className="text-gray-900">
                      {ledgerHoldings.transaction_count ?? 0}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-gray-500">Last Activity</dt>
                    <dd className="text-gray-900">
                      {ledgerHoldings.last_transaction_at &&
                      isValidDate(
                        new Date(String(ledgerHoldings.last_transaction_at))
                      )
                        ? format(
                            new Date(
                              String(ledgerHoldings.last_transaction_at)
                            ),
                            'MMM d, yyyy HH:mm'
                          )
                        : '—'}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="text-sm text-gray-600">
                  No ledger holdings available.
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardContent className="p-4">
              <h2 className="text-lg font-semibold mb-3">
                Ledger Transactions
              </h2>
              <DataTable<Record<string, unknown>>
                data={ledgerTransactions}
                columns={[
                  {
                    key: 'timestamp',
                    title: 'Time',
                    render: (v) =>
                      v && typeof v === 'string' && isValidDate(new Date(v))
                        ? format(new Date(v), 'MMM d, yyyy HH:mm')
                        : '—',
                  },
                  { key: 'type', title: 'Type' },
                  { key: 'status', title: 'Status' },
                  {
                    key: 'amount_usd',
                    title: 'Amount (USD)',
                    render: (v) =>
                      formatCurrency(
                        typeof v === 'string' ? parseFloat(v) : Number(v ?? 0)
                      ),
                  },
                  {
                    key: 'shares',
                    title: 'Shares',
                    render: (v) => {
                      const n =
                        typeof v === 'string' ? parseFloat(v) : Number(v ?? 0);
                      return isNaN(n)
                        ? '0'
                        : n.toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          });
                    },
                  },
                  {
                    key: 'price_per_share',
                    title: 'PPS',
                    render: (v) => {
                      const n =
                        typeof v === 'string' ? parseFloat(v) : Number(v ?? 0);
                      return isNaN(n) ? '—' : `${n.toFixed(4)}`;
                    },
                  },
                  { key: 'asset', title: 'Asset' },
                  { key: 'account', title: 'Account' },
                  {
                    key: 'asset_quantity',
                    title: 'Qty',
                    render: (v) => {
                      const n =
                        typeof v === 'string' ? parseFloat(v) : Number(v ?? 0);
                      return isNaN(n)
                        ? '—'
                        : n.toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          });
                    },
                  },
                ]}
                loading={false}
                error={null}
                emptyMessage="No ledger transactions"
                editable={false}
                selectableRows={false}
                data-testid="tokenized-vault-ledger-table"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // If not a tokenized vault, show not found
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">
          Vault Not Found
        </h1>
        <p className="text-gray-600 mb-4">
          The requested vault could not be found.
        </p>
        <Button onClick={() => navigate('/vaults')}>Back to Vaults</Button>
      </div>
    </div>
  );
};

export default VaultDetailPage;
