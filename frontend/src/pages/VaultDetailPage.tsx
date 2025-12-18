import { format, differenceInDays } from 'date-fns';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import ComboBox from '../components/ui/ComboBox';
import DataTable, { TableColumn } from '../components/ui/DataTable';
import ManualPricingControl from '../components/tokenized/ManualPricingControl';
import QuickBorrowLoanModal from '../components/modals/QuickBorrowLoanModal';
import QuickRepayModal from '../components/modals/QuickRepayModal';
import { useToast } from '../components/ui/Toast';
import { vaultApi, transactionApi, tokenizedVaultApi, vaultLedgerApi, portfolioApi, ApiError } from '../services/api';
import { formatCurrency, formatPercentage, formatPnL, getDecimalPlaces } from '../utils/currencyFormatter';

type Vault = {
  id: string;
  is_vault: boolean;
  vault_name?: string;
  vault_status?: string;
  vault_ended_at?: string;
  asset: string;
  account: string;
  horizon?: string;
  deposit_date: string;
  deposit_qty: string;
  deposit_cost: string;
  deposit_unit_cost: string;
  withdrawal_qty: string;
  withdrawal_value: string;
  withdrawal_unit_price: string;
  pnl: string;
  pnl_percent: string;
  is_open: boolean;
  realized_pnl: string;
  remaining_qty: string;
  created_at: string;
  updated_at: string;
};

type Transaction = {
  id: string;
  date: string;
  type: string;
  asset: string;
  account: string;
  quantity: string;
  amount_usd: number;
  amount_vnd: number;
  counterparty?: string;
  tag?: string;
  note?: string;
  investment_id?: string;
};

type Option = { value: string; label: string };

type ManualMetrics = {
  as_of?: string;
  current_value_usd?: number;
  roi_realtime_percent?: number;
  apr_percent?: number;
  benchmark_asset?: string;
  benchmark_roi_percent?: number;
  benchmark_apr_percent?: number;
};

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
  const { vaultId: _vaultId, vaultName: _vaultName } = useParams<{ vaultId?: string; vaultName?: string }>();
  const vaultId = _vaultId ?? _vaultName ?? '';
  const navigate = useNavigate();
  const { error: showErrorToast, success: showSuccessToast } = useToast();

  const [vault, setVault] = useState<Vault | null>(null);
  const [tokenizedVaultDetails, setTokenizedVaultDetails] = useState<TokenizedVaultDetails | null>(null);
  const [ledgerHoldings, setLedgerHoldings] = useState<null | { total_shares?: string | number; total_aum?: string | number; share_price?: string | number; transaction_count?: number; last_transaction_at?: string }>(null);
  const [ledgerTransactions, setLedgerTransactions] = useState<any[]>([]);
  const [isTokenizedVault, setIsTokenizedVault] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showDepositForm, setShowDepositForm] = useState<boolean>(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [manualMetrics, setManualMetrics] = useState<ManualMetrics | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<ManualMetrics | null>(null);
  const [showLiveMetrics, setShowLiveMetrics] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState(0);

  // Borrowings special UI state
  const [borrowingsSummary, setBorrowingsSummary] = useState<null | {
    outstandingUSD: number;
    liabilities: Array<{ counterparty: string; asset: string; amount: number; valueUSD: number }>;
  }>(null);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [showRepayModal, setShowRepayModal] = useState(false);

  // Tokenized vault deposit/withdraw UI state
  const [showTokenizedDepositForm, setShowTokenizedDepositForm] = useState<boolean>(false);
  const [showTokenizedWithdrawForm, setShowTokenizedWithdrawForm] = useState<boolean>(false);
  const [tokenizedDepositAmount, setTokenizedDepositAmount] = useState<string>('');
  const [tokenizedWithdrawAmount, setTokenizedWithdrawAmount] = useState<string>('');
  const [tokenizedNotes, setTokenizedNotes] = useState<string>('');
  const [tokenizedSourceAccount, setTokenizedSourceAccount] = useState<string>('');
  const [tokenizedTargetAccount, setTokenizedTargetAccount] = useState<string>('');

  // Form states (legacy vault)
  const [depositForm, setDepositForm] = useState({
    quantity: '',
    cost: '',
    sourceAccount: '',
  });

  const [withdrawForm, setWithdrawForm] = useState({
    quantity: '',
    value: '',
    targetAccount: '',
  });
  const [withdrawPercent, setWithdrawPercent] = useState<string>('');

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
      const params = showLiveMetrics ? { enrich: true } : {};
      const tokenizedData = await tokenizedVaultApi.get<TokenizedVaultDetails>(vaultId, params);
      if (tokenizedData) {
        setTokenizedVaultDetails(tokenizedData);
        setIsTokenizedVault(true);
        setVault(null);
        setManualMetrics(null);
        setLiveMetrics(null);
        setTransactions([]);
        // Load ledger data for tokenized vaults
        try {
          const [h, tx] = await Promise.all([
            vaultLedgerApi.holdings<any>(vaultId),
            vaultLedgerApi.transactions<any[]>(vaultId, { limit: 100 }),
          ]);
          setLedgerHoldings(h ?? null);
          const ppsRaw = (h as any)?.share_price;
          const pps = typeof ppsRaw === 'string' ? parseFloat(ppsRaw) : (ppsRaw ?? 1);
          const mapped = (Array.isArray(tx) ? tx : []).map((e: any) => {
            const usd = typeof e?.usdValue === 'string' ? parseFloat(e.usdValue) : Number(e?.usdValue ?? 0);
            const qty = typeof e?.amount === 'string' ? parseFloat(e.amount) : Number(e?.amount ?? 0);
            const price = Number(pps) || 1;
            return {
              timestamp: e?.at ?? e?.timestamp ?? null,
              type: String(e?.type ?? '').toUpperCase(),
              status: e?.status ?? '-',
              amount_usd: isNaN(usd) ? 0 : usd,
              shares: isNaN(usd) ? 0 : usd / price,
              price_per_share: price,
              asset: typeof e?.asset === 'object' && e?.asset ? String(e.asset.symbol || '') : String(e?.asset ?? ''),
              account: e?.account ?? null,
              asset_quantity: isNaN(qty) ? 0 : qty,
            };
          });
          setLedgerTransactions(mapped);
        } catch (e) {
          console.warn('Failed to load ledger data', e);
          setLedgerHoldings(null);
          setLedgerTransactions([]);
        }
        loadedTokenized = true;
        setRetryCount(0);
      }
    } catch (err) {
      const apiErr = err as unknown as ApiError;
      // If route param looks like a tokenized ID and backend says 404, stop here with a clear error
      if (apiErr instanceof ApiError && apiErr.status === 404 && isTokenizedId) {
        setError('Tokenized vault not found');
        setLoading(false);
        return;
      }
      // For other errors, retry a few times then surface error
      if (!(apiErr instanceof ApiError && apiErr.status === 404)) {
        if (retryCount < MAX_RETRIES) {
          setTimeout(() => setRetryCount(retryCount + 1), 1000 * (retryCount + 1));
        } else {
          const message = apiErr instanceof Error ? apiErr.message : 'Failed to load vault';
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

    // Fallback only for legacy investment vault IDs (not prefixed with vault_)
    if (isTokenizedId) {
      setError('Tokenized vault not found');
      setLoading(false);
      return;
    }

    try {
      const endpoint = showLiveMetrics
        ? `/api/vaults/${encodeURIComponent(vaultId)}?enrich=true`
        : `/api/vaults/${encodeURIComponent(vaultId)}`;
      const vaultData = await fetch(`${(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080')}${endpoint}`).then(
        async (r) => {
          const t = await r.text();
          return t ? (JSON.parse(t) as Vault) : null;
        }
      );
      setVault(vaultData ?? null);
      setIsTokenizedVault(false);
      setTokenizedVaultDetails(null);
      setLedgerHoldings(null);
      setLedgerTransactions([]);
      if (vaultData && showLiveMetrics) {
        const lm: ManualMetrics = {
          as_of: (vaultData as unknown as { as_of?: string }).as_of,
          current_value_usd: (vaultData as unknown as { current_value_usd?: number }).current_value_usd,
          roi_realtime_percent: (vaultData as unknown as { roi_realtime_percent?: number }).roi_realtime_percent,
          apr_percent: (vaultData as unknown as { apr_percent?: number }).apr_percent,
          benchmark_asset: (vaultData as unknown as { benchmark_asset?: string }).benchmark_asset,
          benchmark_roi_percent: (vaultData as unknown as { benchmark_roi_percent?: number }).benchmark_roi_percent,
          benchmark_apr_percent: (vaultData as unknown as { benchmark_apr_percent?: number }).benchmark_apr_percent,
        };
        setLiveMetrics(lm);
      } else {
        setLiveMetrics(null);
      }
      setRetryCount(0);
    } catch (err: unknown) {
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => setRetryCount(retryCount + 1), 1000 * (retryCount + 1));
      } else {
        const message = err instanceof Error ? err.message : 'Failed to load vault';
        setError(message);
        showErrorToast('Failed to load vault details after multiple retries');
      }
    } finally {
      setLoading(false);
    }
  }, [vaultId, showErrorToast, showLiveMetrics, retryCount]);

  const loadVaultTransactions = useCallback(async (): Promise<void> => {
    try {
      if (!vaultId || isTokenizedVault) {
        if (isTokenizedVault) {
          setTransactions([]);
        }
        return;
      }
      const txs = await transactionApi.list<Transaction[]>({ investment_id: vaultId });
      setTransactions(Array.isArray(txs) ? txs : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to load vault transactions:', message);
    }
  }, [vaultId, isTokenizedVault]);

  const loadAccounts = (): void => {
    // This would come from admin API in a real implementation
    const mockAccounts: Option[] = [
      { value: 'Cash - VND', label: 'Cash - VND (bank)' },
      { value: 'Cash - USD', label: 'Cash - USD (bank)' },
      { value: 'Binance', label: 'Binance (exchange)' },
      { value: 'Coinbase', label: 'Coinbase (exchange)' },
    ];
    setAccounts(mockAccounts);
  };

  const handleTokenizedDelete = async (): Promise<void> => {
    if (!tokenizedVaultDetails) return;
    if (!confirm('Delete this tokenized vault permanently? This action cannot be undone.')) {
      return;
    }
    try {
      await tokenizedVaultApi.delete(tokenizedVaultDetails.id);
      showSuccessToast('Vault deleted successfully!');
      navigate('/vaults');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete vault';
      showErrorToast(message);
    }
  };

  const handleTokenizedClose = async (): Promise<void> => {
    if (!tokenizedVaultDetails) return;
    if (!confirm('Close this vault? This marks the vault as closed but keeps historical data.')) {
      return;
    }
    try {
      await tokenizedVaultApi.close(tokenizedVaultDetails.id);
      showSuccessToast('Vault closed successfully!');
      await loadVault();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to close vault';
      showErrorToast(message);
    }
  };

  const handleTokenizedMetricsUpdate = (metrics: { price: number; totalValue: number }): void => {
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
      showErrorToast('Enter a valid USD amount to deposit');
      return;
    }
    const minDep = parseFloat(tokenizedVaultDetails.min_deposit_amount || '0');
    if (minDep && amount < minDep) {
      showErrorToast(`Minimum deposit is ${formatCurrency(minDep)}`);
      return;
    }
    try {
      await tokenizedVaultApi.deposit(tokenizedVaultDetails.id, { amount, notes: tokenizedNotes || undefined, source_account: tokenizedSourceAccount || undefined });
      showSuccessToast('Deposit recorded');
      setShowTokenizedDepositForm(false);
      setTokenizedDepositAmount('');
      setTokenizedNotes('');
      setTokenizedSourceAccount('');
      await loadVault();
      await loadVaultTransactions();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to deposit to vault';
      showErrorToast(message);
    }
  };

  const handleTokenizedWithdraw = async (): Promise<void> => {
    if (!tokenizedVaultDetails) return;
    const amount = parseFloat(tokenizedWithdrawAmount ?? '');
    if (!amount || amount <= 0) {
      showErrorToast('Enter a valid USD amount to withdraw');
      return;
    }
    const minW = parseFloat(tokenizedVaultDetails.min_withdrawal_amount || '0');
    if (minW && amount < minW) {
      showErrorToast(`Minimum withdrawal is ${formatCurrency(minW)}`);
      return;
    }
    try {
      await tokenizedVaultApi.withdraw(tokenizedVaultDetails.id, { amount, notes: tokenizedNotes || undefined });
      // Also reflect on Transactions if a target account was provided
      if (tokenizedTargetAccount) {
        await transactionApi.create({
          date: new Date().toISOString(),
          type: 'withdraw',
          asset: 'USD',
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
      await loadVault();
      await loadVaultTransactions();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to withdraw from vault';
      showErrorToast(message);
    }
  };

  useEffect(() => {
    if (vaultId) {
      void loadVault();
      void loadVaultTransactions();
      loadAccounts();
    }
  }, [vaultId, loadVault, loadVaultTransactions, showLiveMetrics]);

  // Load Borrowings summary when viewing the Borrowings vault
  useEffect(() => {
    const fetchBorrowings = async () => {
      try {
        const isBorrowings = isTokenizedVault
          ? String(tokenizedVaultDetails?.name || '').toLowerCase() === 'borrowings'
          : String(vault?.account || vaultId || '').toLowerCase() === 'borrowings';
        if (!isBorrowings) {
          setBorrowingsSummary(null);
          return;
        }
        const r = await portfolioApi.report<any>();
        const liabs = Array.isArray(r?.liabilities) ? r.liabilities : [];
        const mapped = liabs.map((o: any) => ({
          counterparty: String(o?.counterparty ?? ''),
          asset: typeof o?.asset === 'object' && o?.asset ? String(o.asset.symbol || '') : String(o?.asset ?? ''),
          amount: Number(o?.amount ?? 0),
          valueUSD: Number(o?.valueUSD ?? 0),
        }));
        const outstandingUSD = mapped.reduce((s: number, x: any) => s + (Number(x.valueUSD) || 0), 0);
        setBorrowingsSummary({ outstandingUSD, liabilities: mapped });
      } catch (e) {
        setBorrowingsSummary(null);
      }
    };
    void fetchBorrowings();
  }, [isTokenizedVault, tokenizedVaultDetails, vault, vaultId]);

  const handleDeposit = async (): Promise<void> => {
    if (!depositForm.quantity || !depositForm.cost) {
      showErrorToast('Please enter quantity and cost');
      return;
    }

    try {
      if (!vaultId) return;
      await vaultApi.depositToVault(vaultId, {
        quantity: parseFloat(depositForm.quantity),
        cost: parseFloat(depositForm.cost),
        ...(depositForm.sourceAccount ? { sourceAccount: depositForm.sourceAccount } : {}),
      });

      // Reflect on Transactions if a source account is provided
      if (depositForm.sourceAccount) {
        await transactionApi.create({
          date: new Date().toISOString(),
          type: 'deposit',
          asset: 'USD',
          account: depositForm.sourceAccount,
          quantity: parseFloat(depositForm.cost),
          price_local: 1,
          counterparty: `Vault ${vaultId}`,
          note: null,
          fx_to_usd: 1,
          fx_to_vnd: 0,
        });
      }

      showSuccessToast('Deposit successful!');
      setShowDepositForm(false);
      setDepositForm({ quantity: '', cost: '', sourceAccount: '' });

      // Reload vault data and transactions
      await loadVault();
      await loadVaultTransactions();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process deposit';
      showErrorToast(message);
    }
  };

  const handleWithdraw = async (): Promise<void> => {
    if (!withdrawForm.quantity || !withdrawForm.value) {
      showErrorToast('Please enter quantity and value');
      return;
    }

    try {
      if (!vaultId) return;
      await vaultApi.withdrawFromVault(vaultId, {
        quantity: parseFloat(withdrawForm.quantity),
        value: parseFloat(withdrawForm.value),
        ...(withdrawForm.targetAccount ? { targetAccount: withdrawForm.targetAccount } : {}),
      });

      showSuccessToast('Withdrawal successful!');
      setShowWithdrawForm(false);
      setWithdrawForm({ quantity: '', value: '', targetAccount: '' });

      // Reload vault data and transactions
      await loadVault();
      await loadVaultTransactions();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process withdrawal';
      showErrorToast(message);
    }
  };

  const handleEndVault = async (): Promise<void> => {
    if (!confirm('Are you sure you want to end this vault? This will mark it as closed.')) {
      return;
    }

    try {
      if (!vaultId) return;
      await vaultApi.endVault(vaultId);
      showSuccessToast('Vault ended successfully!');
      await loadVault();
      await loadVaultTransactions();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to end vault';
      showErrorToast(message);
    }
  };

  const handleDeleteVault = async (): Promise<void> => {
    if (!confirm('Delete this vault permanently? This cannot be undone.')) {
      return;
    }
    try {
      if (!vaultId) return;
      await vaultApi.deleteVault(vaultId);
      showSuccessToast('Vault deleted successfully!');
      navigate('/vaults');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete vault';
      showErrorToast(message);
    }
  };

  const handleManualUpdate = async (): Promise<void> => {
    const input = window.prompt('Enter current value (USD) for manual update');
    if (input === null) return; // cancelled
    const value = parseFloat(input);
    if (isNaN(value) || value <= 0) {
      showErrorToast('Please enter a valid positive number');
      return;
    }
    try {
      if (!vaultId) return;
      const data = await vaultApi.refresh<ManualMetrics>(vaultId, { current_value_usd: value, persist: true });
      if (data) {
        setManualMetrics(data);
        showSuccessToast('Manual update calculated');
        await loadVault();
        await loadVaultTransactions();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to run manual update';
      showErrorToast(message);
    }
  };

  const formatVaultNumber = (value: string | number, decimals: number = 2): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const vaultColumns: TableColumn<Vault>[] = [
    {
      key: 'created_at',
      title: 'Created',
      type: 'date',
    },
    {
      key: 'deposit_date',
      title: 'First Deposit',
      type: 'date',
    },
    {
      key: 'deposit_qty',
      title: 'Total Deposited',
      type: 'number',
      decimals: 8,
      render: (value, _column, row) => {
        const qty = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const decimals = getDecimalPlaces(row.asset || 'USD');
        return formatVaultNumber(qty, decimals);
      },
    },
    {
      key: 'deposit_cost',
      title: 'Total Cost',
      type: 'currency',
      currency: 'USD',
      render: (value) => formatCurrency(typeof value === 'string' && value !== '' ? parseFloat(value) : 0, 'USD'),
    },
    {
      key: 'remaining_qty',
      title: 'Remaining Balance',
      type: 'number',
      decimals: 8,
      render: (value, _column, row) => {
        const qty = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const decimals = getDecimalPlaces(row.asset || 'USD');
        return formatVaultNumber(qty, decimals);
      },
    },
    {
      key: 'pnl',
      title: 'Realized P&L',
      type: 'currency',
      currency: 'USD',
      render: (value) => {
        const pnl = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const formattedPnL = formatPnL(pnl, 'USD') as { colorClass: string; sign: string; value: string };
        return <span className={formattedPnL.colorClass}>{formattedPnL.sign}{formattedPnL.value}</span>;
      },
    },
    {
      key: 'pnl_percent',
      title: 'ROI %',
      type: 'number',
      decimals: 2,
      render: (value) => {
        const roi = typeof value === 'string' && value !== '' ? parseFloat(value) : 0;
        const isPositive = roi > 0;
        const className = isPositive ? 'text-green-700' : roi < 0 ? 'text-red-700' : 'text-gray-700';
        return <span className={className}>{formatPercentage(roi / 100, 2)}</span>;
      },
    },
    {
      key: 'vault_status',
      title: 'Status',
      render: (value) => {
        const status = (typeof value === 'string' ? value : String(value as string ?? '')).toLowerCase();
        const statusConfig = {
          active: { label: 'Active', class: 'bg-green-100 text-green-800' },
          ended: { label: 'Ended', class: 'bg-red-100 text-red-800' },
          closed: { label: 'Closed', class: 'bg-gray-100 text-gray-800' },
        };
        const config = statusConfig[status as keyof typeof statusConfig] || { label: status, class: 'bg-gray-100 text-gray-800' };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class}`}>
            {config.label}
          </span>
        );
      },
    },
  ];

  const transactionColumns: TableColumn<Transaction>[] = [
    {
      key: 'date',
      title: 'Date',
      type: 'date',
    },
    {
      key: 'type',
      title: 'Type',
      render: (value: unknown) => {
        const type = String(value as string ?? '').toLowerCase();
        const typeConfig = {
          deposit: { label: 'Deposit', class: 'bg-green-100 text-green-800' },
          withdrawal: { label: 'Withdrawal', class: 'bg-red-100 text-red-800' },
          stake: { label: 'Stake', class: 'bg-blue-100 text-blue-800' },
          unstake: { label: 'Unstake', class: 'bg-purple-100 text-purple-800' },
        };
        const config = typeConfig[type as keyof typeof typeConfig] || { label: type, class: 'bg-gray-100 text-gray-800' };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class}`}>
            {config.label}
          </span>
        );
      },
    },
    {
      key: 'asset',
      title: 'Asset',
    },
    {
      key: 'quantity',
      title: 'Quantity',
      type: 'number',
      decimals: 8,
    },
    {
      key: 'amount_usd',
      title: 'Amount (USD)',
      type: 'currency',
      currency: 'USD',
    },
    {
      key: 'counterparty',
      title: 'Source/Target',
    },
    {
      key: 'note',
      title: 'Note',
    },
  ];

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
        const num = typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
        return isNaN(num) ? '0' : num.toLocaleString(undefined, { maximumFractionDigits: 6 });
      },
    },
    {
      key: 'current_market_value',
      title: 'Market Value',
      type: 'currency',
      currency: 'USD',
      render: (value) => formatCurrency(typeof value === 'string' ? parseFloat(value) : Number(value ?? 0)),
    },
    {
      key: 'allocation_percent',
      title: 'Allocation',
      render: (value) => {
        const num = typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
        return isNaN(num) ? '0.00%' : `${num.toFixed(2)}%`;
      },
    },
    {
      key: 'unrealized_pnl',
      title: 'Unrealized P&L',
      type: 'currency',
      currency: 'USD',
      render: (value) => formatCurrency(typeof value === 'string' ? parseFloat(value) : Number(value ?? 0)),
    },
    {
      key: 'unrealized_pnl_percent',
      title: 'PnL %',
      render: (value) => {
        const num = typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
        return isNaN(num) ? '0.00%' : `${num.toFixed(2)}%`;
      },
    },
  ];

  const isUsdOnlyVault = useMemo(() => {
    return (vault?.asset ?? '').toUpperCase() === 'USD';
  }, [vault]);

  // Whether the current vault represents the special Borrowings view
  const isBorrowings = useMemo(() => {
    if (isTokenizedVault) {
      return String(tokenizedVaultDetails?.name || '').toLowerCase() === 'borrowings';
    }
    return String(vault?.account || vaultId || '').toLowerCase() === 'borrowings';
  }, [isTokenizedVault, tokenizedVaultDetails, vault, vaultId]);

  useEffect(() => {
    // When opening deposit form for USD vault, default qty to 1
    if (isUsdOnlyVault && showDepositForm) {
      setDepositForm((s) => ({ ...s, quantity: s.quantity ?? '1' }));
    }
  }, [isUsdOnlyVault, showDepositForm]);

  const onChangeWithdrawPercent = (val: string) => {
    setWithdrawPercent(val);
    const pct = parseFloat(val ?? '');
    const rem = parseFloat(String(vault?.remaining_qty ?? '0'));
    if (!isNaN(pct) && !isNaN(rem)) {
      const qty = Math.max(0, Math.min(100, pct)) / 100 * rem;
      setWithdrawForm((s) => ({ ...s, quantity: String(qty) }));
    }
  };

  // Helpers and handlers for Borrowings quick actions
  const toAssetObj = (symbol: string) => ({
    type: (symbol.toUpperCase() === 'USD' || symbol.length === 3) ? 'FIAT' as const : 'CRYPTO' as const,
    symbol: symbol.toUpperCase(),
  });

  const refreshBorrowings = useCallback(async () => {
    try {
      const r = await portfolioApi.report<any>();
      const liabs = Array.isArray(r?.liabilities) ? r.liabilities : [];
      const mapped = liabs.map((o: any) => ({
        counterparty: String(o?.counterparty ?? ''),
        asset: typeof o?.asset === 'object' && o?.asset ? String(o.asset.symbol || '') : String(o?.asset ?? ''),
        amount: Number(o?.amount ?? 0),
        valueUSD: Number(o?.valueUSD ?? 0),
      }));
      const outstandingUSD = mapped.reduce((s: number, x: any) => s + (Number(x.valueUSD) || 0), 0);
      setBorrowingsSummary({ outstandingUSD, liabilities: mapped });
    } catch {}
  }, []);

  const handleBorrowSubmit = useCallback(async (d: { date: string; amount: number; account?: string; asset: string; counterparty?: string; note?: string; }) => {
    await transactionApi.borrow({
      asset: toAssetObj(d.asset),
      amount: Number(d.amount),
      account: d.account || undefined,
      counterparty: d.counterparty || 'general',
      note: d.note || undefined,
      at: d.date,
    } as any);
    await loadVault();
    await loadVaultTransactions();
    await refreshBorrowings();
    setShowBorrowModal(false);
  }, [loadVault, loadVaultTransactions, refreshBorrowings]);

  const handleRepaySubmit = useCallback(async (d: { date: string; amount: number; account?: string; asset: string; counterparty?: string; note?: string; direction: 'BORROW' | 'LOAN' }) => {
    await transactionApi.repay({
      asset: toAssetObj(d.asset),
      amount: Number(d.amount),
      account: d.account || undefined,
      counterparty: d.counterparty || 'general',
      note: d.note || undefined,
      direction: 'BORROW',
      at: d.date,
    } as any);
    await loadVault();
    await loadVaultTransactions();
    await refreshBorrowings();
    setShowRepayModal(false);
  }, [loadVault, loadVaultTransactions, refreshBorrowings]);

  console.log('VaultDetailPage render:', {
    loading,
    error,
    vault: vault ? 'present' : 'null',
    tokenized: tokenizedVaultDetails ? 'present' : 'null',
    isTokenizedVault,
    vaultId,
  });

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
              onSubmit={async (d) => { await handleBorrowSubmit(d); }}
            />
            <QuickRepayModal
              isOpen={showRepayModal}
              onClose={() => setShowRepayModal(false)}
              onSubmit={async (d) => { await handleRepaySubmit(d); }}
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
          <h1 className="text-2xl font-bold text-red-600 mb-4">Vault Not Found</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/vaults')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Vaults
          </button>
        </div>
      </div>
    );
  }

  if (isTokenizedVault && tokenizedVaultDetails) {
    const tokenPrice = parseFloat(tokenizedVaultDetails.current_share_price ?? '0');
    const totalSupply = parseFloat(tokenizedVaultDetails.total_supply ?? '0');
    const totalValue = parseFloat(tokenizedVaultDetails.total_assets_under_management ?? '0');
    const performance = parseFloat(tokenizedVaultDetails.performance_since_inception ?? '0');
    const inceptionDate = new Date(tokenizedVaultDetails.inception_date);
    const asOfDate = tokenizedVaultDetails.as_of ? new Date(tokenizedVaultDetails.as_of) : new Date();
    const daysSinceInception = Math.max(1, differenceInDays(asOfDate, inceptionDate));
    const yearsSinceInception = daysSinceInception / 365.25;
    const roiDecimal = (performance || 0) / 100;
    const aprSinceInception = (1 + roiDecimal) > 0 && yearsSinceInception > 0
      ? (Math.pow(1 + roiDecimal, 1 / yearsSinceInception) - 1) * 100
      : 0;
    const status = tokenizedVaultDetails.status?.toLowerCase() ?? 'unknown';
    const statusConfig: Record<string, { label: string; className: string }> = {
      active: { label: 'Active', className: 'bg-green-100 text-green-800' },
      paused: { label: 'Paused', className: 'bg-yellow-100 text-yellow-800' },
      closed: { label: 'Closed', className: 'bg-gray-100 text-gray-800' },
      liquidating: { label: 'Liquidating', className: 'bg-red-100 text-red-800' },
    };
    const statusBadge = statusConfig[status] ?? { label: status, className: 'bg-gray-100 text-gray-800' };
    const isBorrowings = (tokenizedVaultDetails.name || '').toLowerCase() === 'borrowings';

    const canDeposit = tokenizedVaultDetails.status === 'active' && tokenizedVaultDetails.is_deposit_allowed;
    const canWithdraw = tokenizedVaultDetails.status === 'active' && tokenizedVaultDetails.is_withdrawal_allowed;

    const toAssetObj = (symbol: string) => ({ type: (symbol.toUpperCase() === 'USD' || symbol.length === 3) ? 'FIAT' as const : 'CRYPTO' as const, symbol: symbol.toUpperCase() });
    const refreshBorrowings = async () => {
      try {
        const r = await portfolioApi.report<any>();
        const liabs = Array.isArray(r?.liabilities) ? r.liabilities : [];
        const mapped = liabs.map((o: any) => ({
          counterparty: String(o?.counterparty ?? ''),
          asset: typeof o?.asset === 'object' && o?.asset ? String(o.asset.symbol || '') : String(o?.asset ?? ''),
          amount: Number(o?.amount ?? 0),
          valueUSD: Number(o?.valueUSD ?? 0),
        }));
        const outstandingUSD = mapped.reduce((s: number, x: any) => s + (Number(x.valueUSD) || 0), 0);
        setBorrowingsSummary({ outstandingUSD, liabilities: mapped });
      } catch {}
    };

    const handleBorrowSubmit = async (d: { date: string; amount: number; account?: string; asset: string; counterparty?: string; note?: string; }) => {
      await transactionApi.borrow({
        asset: toAssetObj(d.asset),
        amount: Number(d.amount),
        account: d.account || undefined,
        counterparty: d.counterparty || 'general',
        note: d.note || undefined,
        at: d.date,
      } as any);
      await loadVault();
      await loadVaultTransactions();
      await refreshBorrowings();
      setShowBorrowModal(false);
    };

    const handleRepaySubmit = async (d: { date: string; amount: number; account?: string; asset: string; counterparty?: string; note?: string; direction: 'BORROW' | 'LOAN' }) => {
      await transactionApi.repay({
        asset: toAssetObj(d.asset),
        amount: Number(d.amount),
        account: d.account || undefined,
        counterparty: d.counterparty || 'general',
        note: d.note || undefined,
        direction: 'BORROW',
        at: d.date,
      } as any);
      await loadVault();
      await loadVaultTransactions();
      await refreshBorrowings();
      setShowRepayModal(false);
    };

    return (
      <div className="px-4 py-6 sm:px-0" data-testid="tokenized-vault-detail-page">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate('/vaults')}
              className="mb-4 text-blue-600 hover:text-blue-800 flex items-center"
            >
              ← Back to Vaults
            </button>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              {tokenizedVaultDetails.name} ({tokenizedVaultDetails.token_symbol})
            </h1>
            <p className="text-gray-600">{tokenizedVaultDetails.description ?? 'Tokenized vault overview'}</p>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        </div>

        {/* Borrowings special summary */}
        {isBorrowings && (
          <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Borrowings Overview</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowBorrowModal(true); setShowRepayModal(false); }}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Borrow
                </button>
                <button
                  onClick={() => { setShowRepayModal(true); setShowBorrowModal(false); }}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Repay
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-gray-500 text-sm">Outstanding Balance</div>
                <div className="text-2xl font-bold text-red-700">{formatCurrency(Math.abs(borrowingsSummary?.outstandingUSD ?? 0))}</div>
                <div className="text-xs text-gray-500">Liability</div>
              </div>
              <div>
                <div className="text-gray-500 text-sm">Entries</div>
                <div className="text-xl font-semibold">{borrowingsSummary?.liabilities?.length ?? 0}</div>
              </div>
              <div>
                <div className="text-gray-500 text-sm">Updated</div>
                <div className="text-sm">{new Date().toLocaleString()}</div>
              </div>
            </div>
            {borrowingsSummary && borrowingsSummary.liabilities.length > 0 && (
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
                        <td className="py-2 pr-4">{o.counterparty || 'general'}</td>
                        <td className="py-2 pr-4">{o.asset}</td>
                        <td className="py-2 pr-4">{Number(o.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                        <td className="py-2 pr-4">{formatCurrency(o.valueUSD)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!isBorrowings && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Token Price</h3>
            <p className="text-2xl font-bold text-gray-900">${isNaN(tokenPrice) ? '0.0000' : tokenPrice.toFixed(4)}</p>
            <p className="text-sm text-gray-600">Live price</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total Supply</h3>
            <p className="text-2xl font-bold text-gray-900">
              {isNaN(totalSupply) ? '0' : totalSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-gray-600">Tokens issued</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Assets Under Management</h3>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(isNaN(totalValue) ? 0 : totalValue)}</p>
            <p className="text-sm text-gray-600">{tokenizedVaultDetails.is_user_defined_price ? 'Manual pricing' : 'Total vault value'}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Performance Since Inception</h3>
            <p className={`text-2xl font-bold ${performance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercentage((performance || 0) / 100, 2)}
            </p>
            <p className="text-sm text-gray-600">Relative to initial share price</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500 mb-2">APR Since Inception</h3>
            <p className={`text-2xl font-bold ${aprSinceInception >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercentage((aprSinceInception || 0) / 100, 2)}
            </p>
            <p className="text-sm text-gray-600">Annualized from inception</p>
          </div>
        </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <ManualPricingControl
              vaultId={tokenizedVaultDetails.id}
              currentPrice={isNaN(tokenPrice) ? 0 : tokenPrice}
              currentTotalValue={isNaN(totalValue) ? 0 : totalValue}
              totalSupply={isNaN(totalSupply) ? 0 : totalSupply}
              isManualPricing={tokenizedVaultDetails.is_user_defined_price}
              onMetricsUpdate={handleTokenizedMetricsUpdate}
              onPricingModeChange={handleTokenizedPricingModeChange}
            />
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Vault Configuration</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-500">Inception Date</dt>
                <dd className="text-gray-900">{format(new Date(tokenizedVaultDetails.inception_date), 'MMM d, yyyy')}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Last Updated</dt>
                <dd className="text-gray-900">{format(new Date(tokenizedVaultDetails.last_updated), 'MMM d, yyyy HH:mm')}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Created By</dt>
                <dd className="text-gray-900">{tokenizedVaultDetails.created_by}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Price Last Updated</dt>
                <dd className="text-gray-900">
                  {tokenizedVaultDetails.price_last_updated_at
                    ? format(new Date(tokenizedVaultDetails.price_last_updated_at), 'MMM d, yyyy HH:mm')
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Min Deposit</dt>
                <dd className="text-gray-900">{formatCurrency(parseFloat(tokenizedVaultDetails.min_deposit_amount ?? '0'))}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Min Withdrawal</dt>
                <dd className="text-gray-900">{formatCurrency(parseFloat(tokenizedVaultDetails.min_withdrawal_amount ?? '0'))}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          {tokenizedVaultDetails.status === 'active' && (
            <button
              onClick={() => {
                void handleTokenizedClose();
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Close Vault
            </button>
          )}
          <button
            onClick={() => {
              void handleTokenizedDelete();
            }}
            className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800"
          >
            Delete Vault
          </button>
          <button
            onClick={() => setShowLiveMetrics((s) => !s)}
            className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
          >
            {showLiveMetrics ? 'Hide Asset Breakdown' : 'Show Asset Breakdown'}
          </button>
          <button
            onClick={() => {
              void loadVault();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Refresh
          </button>
          {canDeposit && (
            <button
              onClick={() => {
                setShowTokenizedDepositForm((s) => !s);
                setShowTokenizedWithdrawForm(false);
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Deposit
            </button>
          )}
          {canWithdraw && (
            <button
              onClick={() => {
                setShowTokenizedWithdrawForm((s) => !s);
                setShowTokenizedDepositForm(false);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Withdraw
            </button>
          )}
        </div>

        {(showTokenizedDepositForm || showTokenizedWithdrawForm) && (
          <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
            <h3 className="text-lg font-semibold mb-4">
              {showTokenizedDepositForm ? 'Deposit to Vault' : 'Withdraw from Vault'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={showTokenizedDepositForm ? tokenizedDepositAmount : tokenizedWithdrawAmount}
                  onChange={(e) =>
                    showTokenizedDepositForm
                      ? setTokenizedDepositAmount(e.target.value)
                      : setTokenizedWithdrawAmount(e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder={showTokenizedDepositForm
                    ? tokenizedVaultDetails.min_deposit_amount
                    : tokenizedVaultDetails.min_withdrawal_amount}
                />
              </div>

              {showTokenizedDepositForm ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source Account (optional)</label>
                  <ComboBox
                    options={accounts}
                    value={tokenizedSourceAccount}
                    onChange={(v) => setTokenizedSourceAccount(String(v))}
                    placeholder="Choose account to deduct from"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Account (optional)</label>
                  <ComboBox
                    options={accounts}
                    value={tokenizedTargetAccount}
                    onChange={(v) => setTokenizedTargetAccount(String(v))}
                    placeholder="Choose account to increase"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={tokenizedNotes}
                  onChange={(e) => setTokenizedNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Reason or memo"
                />
              </div>
            </div>
            <div className="flex space-x-3">
              {showTokenizedDepositForm ? (
                <button
                  onClick={() => { void handleTokenizedDeposit(); }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Deposit
                </button>
              ) : (
                <button
                  onClick={() => { void handleTokenizedWithdraw(); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Withdraw
                </button>
              )}
              <button
                onClick={() => {
                  setShowTokenizedDepositForm(false);
                  setShowTokenizedWithdrawForm(false);
                  setTokenizedNotes('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {tokenizedVaultDetails.asset_breakdown && tokenizedVaultDetails.asset_breakdown.length > 0 && (
          <div className="bg-white p-4 rounded-lg border border-gray-200">
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
          </div>
        )}

        {/* Ledger-derived holdings and transaction history */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200 lg:col-span-1">
            <h2 className="text-lg font-semibold mb-3">Ledger Holdings</h2>
            {ledgerHoldings ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500">Total Shares</dt>
                  <dd className="text-gray-900">{(() => {
                    const v = ledgerHoldings.total_shares as unknown as string | number | undefined;
                    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
                    return isNaN(Number(n)) ? '0' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 });
                  })()}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Total AUM</dt>
                  <dd className="text-gray-900">{(() => {
                    const v = ledgerHoldings.total_aum as unknown as string | number | undefined;
                    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
                    return formatCurrency(isNaN(Number(n)) ? 0 : Number(n));
                  })()}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Share Price</dt>
                  <dd className="text-gray-900">{(() => {
                    const v = ledgerHoldings.share_price as unknown as string | number | undefined;
                    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
                    return `${isNaN(Number(n)) ? '0.0000' : Number(n).toFixed(4)}`;
                  })()}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Transactions</dt>
                  <dd className="text-gray-900">{ledgerHoldings.transaction_count ?? 0}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-500">Last Activity</dt>
                  <dd className="text-gray-900">{ledgerHoldings.last_transaction_at ? format(new Date(String(ledgerHoldings.last_transaction_at)), 'MMM d, yyyy HH:mm') : '—'}</dd>
                </div>
              </dl>
            ) : (
              <div className="text-sm text-gray-600">No ledger holdings available.</div>
            )}
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200 lg:col-span-2">
            <h2 className="text-lg font-semibold mb-3">Ledger Transactions</h2>
            <DataTable<any>
              data={ledgerTransactions}
              columns={[
                { key: 'timestamp', title: 'Time', render: (v) => (v ? format(new Date(String(v)), 'MMM d, yyyy HH:mm') : '—') },
                { key: 'type', title: 'Type' },
                { key: 'status', title: 'Status' },
                { key: 'amount_usd', title: 'Amount (USD)', render: (v) => formatCurrency(typeof v === 'string' ? parseFloat(v) : Number(v ?? 0)) },
                { key: 'shares', title: 'Shares', render: (v) => {
                  const n = typeof v === 'string' ? parseFloat(v) : Number(v ?? 0);
                  return isNaN(n) ? '0' : n.toLocaleString(undefined, { maximumFractionDigits: 6 });
                } },
                { key: 'price_per_share', title: 'PPS', render: (v) => {
                  const n = typeof v === 'string' ? parseFloat(v) : Number(v ?? 0);
                  return isNaN(n) ? '—' : `${n.toFixed(4)}`;
                } },
                { key: 'asset', title: 'Asset' },
                { key: 'account', title: 'Account' },
                { key: 'asset_quantity', title: 'Qty', render: (v) => {
                  const n = typeof v === 'string' ? parseFloat(v) : Number(v ?? 0);
                  return isNaN(n) ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 6 });
                } },
              ]}
              loading={false}
              error={null}
              emptyMessage="No ledger transactions"
              editable={false}
              selectableRows={false}
              data-testid="tokenized-vault-ledger-table"
            />
          </div>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Vault Not Found</h1>
          <p className="text-gray-600 mb-4">The requested vault could not be found.</p>
          <button
            onClick={() => navigate('/vaults')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Vaults
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0" data-testid="vault-detail-page">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/vaults')}
          className="mb-4 text-blue-600 hover:text-blue-800 flex items-center"
        >
          ← Back to Vaults
        </button>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {`${vault.asset} @ ${vault.account}${vault.horizon ? ` [${vault.horizon}]` : ''}`}
        </h1>
        <p className="text-gray-600">
          Vault Details - {vault.asset} @ {vault.account}
          {vault.horizon && ` [${vault.horizon}]`}
        </p>
      </div>

      {/* Vault Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Deposited</h3>
          <p className="text-2xl font-bold text-gray-900">
            {(() => {
              const isUSD = String(vault.asset ?? '').toUpperCase() === 'USD';
              const decimals = getDecimalPlaces(vault.asset ?? 'USD');
              const value = isUSD
                ? (typeof vault.deposit_cost === 'string' ? parseFloat(vault.deposit_cost) : (vault.deposit_cost as unknown as number))
                : (typeof vault.deposit_qty === 'string' ? parseFloat(vault.deposit_qty) : (vault.deposit_qty as unknown as number));
              return `${formatVaultNumber(value ?? 0, isUSD ? 2 : decimals)} ${vault.asset}`;
            })()}
          </p>
          <p className="text-sm text-gray-600">{formatCurrency(parseFloat(vault.deposit_cost ?? '0'))}</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Current Balance</h3>
          <p className="text-2xl font-bold text-gray-900">
            {(() => {
              const isUSD = String(vault.asset ?? '').toUpperCase() === 'USD';
              if (isUSD) {
                const deposit = typeof vault.deposit_cost === 'string' ? parseFloat(vault.deposit_cost) : (vault.deposit_cost as unknown as number);
                const withdrawn = typeof vault.withdrawal_value === 'string' ? parseFloat(vault.withdrawal_value) : (vault.withdrawal_value as unknown as number);
                const remainingUSD = (deposit ?? 0) - (withdrawn ?? 0);
                return `${formatVaultNumber(remainingUSD < 0 ? 0 : remainingUSD, 2)} USD`;
              }
              const decimals = getDecimalPlaces(vault.asset ?? 'USD');
              const qty = typeof vault.remaining_qty === 'string' ? parseFloat(vault.remaining_qty) : (vault.remaining_qty as unknown as number);
              return `${formatVaultNumber(qty ?? 0, decimals)} ${vault.asset}`;
            })()}
          </p>
          <p className="text-sm text-gray-600">Remaining in vault</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Realized P&L</h3>
          <p className={`text-2xl font-bold ${parseFloat(vault.pnl ?? '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(parseFloat(vault.pnl ?? '0'))}
          </p>
          <p className="text-sm text-gray-600">{formatVaultNumber(vault.pnl_percent, 2)}% ROI</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Vault Status</h3>
          <p className="text-lg font-medium text-gray-900 capitalize">{vault.vault_status ?? 'Unknown'}</p>
          <p className="text-sm text-gray-600">
            Created: {format(new Date(vault.created_at), 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3 mb-6">
        <button
          onClick={() => setShowDepositForm(!showDepositForm)}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          disabled={!vault.is_open}
        >
          Deposit to Vault
        </button>
        <button
          onClick={() => setShowWithdrawForm(!showWithdrawForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          disabled={!vault.is_open}
        >
          Withdraw from Vault
        </button>
        {vault.is_open && (
        <button
          onClick={() => { void handleEndVault(); }}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            End Vault
          </button>
        )}
        <button
          onClick={() => { void handleDeleteVault(); }}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Delete Vault
        </button>
        <button
          onClick={() => setShowLiveMetrics((s) => !s)}
          className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
        >
          {showLiveMetrics ? 'Hide Live Metrics' : 'Show Live Metrics'}
        </button>
        <button
          onClick={() => { void handleManualUpdate(); }}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
        >
          Manual Update
        </button>
      </div>

      {/* Deposit Form */}
      {showDepositForm && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
          <h3 className="text-lg font-semibold mb-4">Deposit to Vault</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {isUsdOnlyVault ? (
              <div className="px-3 py-2 border rounded-md bg-gray-50 text-gray-700 flex items-center">Quantity fixed to 1</div>
            ) : (
              <input
                type="number"
                step="any"
                placeholder="Quantity"
                value={depositForm.quantity}
                onChange={(e) => setDepositForm({ ...depositForm, quantity: e.target.value })}
                className="px-3 py-2 border rounded-md"
              />
            )}
            <input
              type="number"
              step="any"
              placeholder="Cost (USD)"
              value={depositForm.cost}
              onChange={(e) => setDepositForm({ ...depositForm, cost: e.target.value })}
              className="px-3 py-2 border rounded-md"
            />
            <ComboBox
              options={accounts}
              value={depositForm.sourceAccount}
              onChange={(value) => setDepositForm({ ...depositForm, sourceAccount: value })}
              placeholder="Source Account (optional)"
            />
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => { void handleDeposit(); }}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Deposit
            </button>
            <button
              onClick={() => setShowDepositForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Withdraw Form */}
      {showWithdrawForm && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
          <h3 className="text-lg font-semibold mb-4">Withdraw from Vault</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {isUsdOnlyVault ? (
              <>
                <input
                  type="number"
                  step="any"
                  placeholder="Withdraw % of remaining"
                  value={withdrawPercent}
                  onChange={(e) => onChangeWithdrawPercent(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Quantity (auto)"
                  value={withdrawForm.quantity}
                  readOnly
                  className="px-3 py-2 border rounded-md bg-gray-50"
                />
              </>
            ) : (
              <input
                type="number"
                step="any"
                placeholder="Quantity"
                value={withdrawForm.quantity}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, quantity: e.target.value })}
                className="px-3 py-2 border rounded-md"
              />
            )}
            <input
              type="number"
              step="any"
              placeholder="Value (USD)"
              value={withdrawForm.value}
              onChange={(e) => setWithdrawForm({ ...withdrawForm, value: e.target.value })}
              className="px-3 py-2 border rounded-md"
            />
            <ComboBox
              options={accounts}
              value={withdrawForm.targetAccount}
              onChange={(value) => setWithdrawForm({ ...withdrawForm, targetAccount: value })}
              placeholder="Target Account (optional)"
            />
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => { void handleWithdraw(); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Withdraw
            </button>
            <button
              onClick={() => setShowWithdrawForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Vault Details Table */}
      {(manualMetrics || liveMetrics) && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
          <h3 className="text-lg font-semibold mb-2">{liveMetrics ? 'Live Metrics' : 'Manual Update'}</h3>
          <div className="text-sm text-gray-700 mb-2">
            As of: {(liveMetrics ?? manualMetrics)?.as_of ? new Date(String((liveMetrics ?? manualMetrics)?.as_of)).toLocaleString() : '—'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-gray-500 text-sm">Current Value</div>
              <div className="font-semibold">{formatCurrency((liveMetrics ?? manualMetrics)?.current_value_usd ?? 0)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-sm">ROI (now)</div>
              <div className="font-semibold">{formatVaultNumber((liveMetrics ?? manualMetrics)?.roi_realtime_percent ?? 0, 2)}%</div>
            </div>
            <div>
              <div className="text-gray-500 text-sm">APR (now)</div>
              <div className="font-semibold">{formatVaultNumber((liveMetrics ?? manualMetrics)?.apr_percent ?? 0, 2)}%</div>
            </div>
          </div>
          {(liveMetrics ?? manualMetrics)?.benchmark_asset && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <div className="text-gray-500 text-sm">Benchmark</div>
                <div className="font-semibold">{(liveMetrics ?? manualMetrics)?.benchmark_asset}</div>
              </div>
              <div>
                <div className="text-gray-500 text-sm">Benchmark ROI</div>
                <div className="font-semibold">{formatVaultNumber(((liveMetrics ?? manualMetrics)?.benchmark_roi_percent) ?? 0, 2)}%</div>
              </div>
              <div>
                <div className="text-gray-500 text-sm">Benchmark APR</div>
                <div className="font-semibold">{formatVaultNumber(((liveMetrics ?? manualMetrics)?.benchmark_apr_percent) ?? 0, 2)}%</div>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Vault Details</h2>
        <DataTable
          data={[vault]}
          columns={vaultColumns}
          loading={false}
          error={null}
          emptyMessage="No vault data available"
          editable={false}
          selectableRows={false}
          data-testid="vault-details-table"
        />
      </div>

      {/* Vault Transactions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Vault Transactions</h2>
        <DataTable
          data={transactions}
          columns={transactionColumns}
          loading={false}
          error={null}
          emptyMessage="No transactions found for this vault"
          editable={false}
          selectableRows={false}
          data-testid="vault-transactions-table"
        />
      </div>
    </div>
  );
};

export default VaultDetailPage;
