import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';


import TransactionForm from '../components/forms/TransactionForm';
import QuickBorrowLoanModal from '../components/modals/QuickBorrowLoanModal';
import QuickBuyModal from '../components/modals/QuickBuyModal';
import QuickExpenseModal from '../components/modals/QuickExpenseModal';
import QuickIncomeModal from '../components/modals/QuickIncomeModal';
import QuickInitBalanceModal from '../components/modals/QuickInitBalanceModal';
import QuickInvestmentModal from '../components/modals/QuickInvestmentModal';
import QuickRepayModal from '../components/modals/QuickRepayModal';
import QuickSellModal from '../components/modals/QuickSellModal';
import QuickTransferModal from '../components/modals/QuickTransferModal';
import QuickVaultModal from '../components/modals/QuickVaultModal';
import { Button } from '../components/ui/button';
import ComboBox from '../components/ui/ComboBox';
import DataTable, {
  TableColumn,
  TableRowBase,
} from '../components/ui/DataTable';
import DateInput from '../components/ui/DateInput';
import { useToast } from '../components/ui/Toast';
import { useApp } from '../context/AppContext';
import { useBackendStatus } from '../context/BackendStatusContext';
import { useModalManager } from '../hooks/useModalManager';
import { useQuickCreate } from '../hooks/useQuickCreate';
import {
  transactionApi,
  adminApi,
  actionsApi,
  investmentsApi,
  vaultApi,
  tokenizedVaultApi,
  ApiError,
} from '../services/api';
import { fxService } from '../services/fxService';
import { toISODateTime, getTodayDate } from '../utils/dateUtils';

type IdType = string | number;
type Transaction = TableRowBase & Record<string, unknown>;
type Option = { value: string; label: string };
type MasterData = Record<string, Option[]>;
// Columns now use the generic TableColumn<Transaction>

const TransactionPage: React.FC = () => {
  const { isOnline } = useBackendStatus();
  const { currency, actions } = useApp() as unknown as {
    currency: string;
    actions: {
      setCurrency: (c: string) => void;
      setError: (m: string | null) => void;
    };
  };
  const { error: showErrorToast, success: showSuccessToast } =
    useToast() as unknown as {
      error: (m: string) => void;
      success: (m: string) => void;
    };
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [showQuickAdd, setShowQuickAdd] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [filters] = useState<Record<string, unknown>>({});
  const [masterData, setMasterData] = useState<MasterData>({});
  const [bulkRefreshing, setBulkRefreshing] = useState<boolean>(false);
  const [busyRowIds, setBusyRowIds] = useState<Set<IdType>>(new Set<IdType>());
  const [selectedIds, setSelectedIds] = useState<Set<IdType>>(
    new Set<IdType>()
  );

  // FX conversion states
  const [fxConversionCache, setFxConversionCache] = useState<
    Map<string, number>
  >(new Map());
  const [fxLoadingStates, setFxLoadingStates] = useState<Map<string, boolean>>(
    new Map()
  );
  // Online FX rates cache keyed by from-to-date
  const [fxRateCache, setFxRateCache] = useState<Map<string, number>>(
    new Map()
  );
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);

  // Modal manager - replaces 11 individual useState hooks for modals
  const {
    isModalOpen,
    openModal: openQuickModal,
    closeModal: closeQuickModal,
  } = useModalManager();

  const [expenseDefaultAccount, setExpenseDefaultAccount] = useState<string | undefined>(undefined);

  const {
    createExpense,
    createIncome,
    createInvestment,
    isLoading: _isQuickLoading,
    error: quickError,
  } = useQuickCreate();

  const todayStr = getTodayDate();

  // Load transactions and master data on mount
  const loadMasterData = useCallback(async (): Promise<void> => {
    try {
      const [types, accounts, assets, tags] = (await Promise.all([
        adminApi.listTypes(),
        adminApi.listAccounts(),
        adminApi.listAssets(),
        adminApi.listTags(),
      ])) as [unknown[], unknown[], unknown[], unknown[]];

      setMasterData({
        type: (types ?? []).map((t: unknown) => ({
          value: String((t as { name: string }).name),
          label:
            (t as { description?: string }).description ??
            String((t as { name: string }).name),
        })),
        account: (accounts ?? []).map((a: unknown) => ({
          value: String((a as { name: string }).name),
          label: `${String((a as { name: string }).name)} (${String((a as { type: string }).type)})`,
        })),
        asset: (assets ?? []).map((a: unknown) => ({
          value: String((a as { symbol: string }).symbol),
          label: `${String((a as { symbol: string }).symbol)} - ${String((a as { name?: string }).name ?? '')}`,
        })),
        tag: (tags ?? []).map((t: unknown) => ({
          value: String((t as { name: string }).name),
          label: `${String((t as { name: string }).name)} (${String((t as { category?: string }).category ?? '')})`,
        })),
        counterparty: [],
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load master data';
      console.error(message);
    }
  }, []);

  const loadTransactions = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Request FX-enhanced data with USD and VND conversion
      const fxFilters = {
        ...filters,
        currencies: 'USD,VND', // Request FX conversion for both currencies
      };

      const data = (await transactionApi.list(fxFilters)) as unknown[];

      // Handle both TransactionWithFX and basic Transaction responses
      if (data && data.length > 0 && 'fx_rates' in (data[0] as Record<string, unknown>)) {
        // FX-enhanced response
        setTransactions(data as Transaction[]);
      } else {
        // Fallback to basic response: map backend Transaction -> UI row shape
        const mapped = (data ?? []).map((raw: unknown) => {
          const rawRecord = raw as Record<string, unknown>;
          const assetObj = rawRecord?.asset;
          const assetSym = typeof assetObj === 'string'
            ? assetObj
            : ((assetObj as Record<string, unknown> | null)?.symbol ?? '');
          const type = (typeof rawRecord?.type === 'string' ? rawRecord.type : '')?.toLowerCase() ?? '';
          const createdRaw = rawRecord?.createdAt ?? rawRecord?.date;
          const created = createdRaw != null && typeof createdRaw === 'string' ? createdRaw : undefined;
          // normalize date to a full ISO string to ensure Safari/Chrome parsing
          let dateISO: string | undefined = undefined;
          if (created) {
            const d = new Date(created);
            dateISO = Number.isNaN(d.getTime()) ? created : d.toISOString();
          }
          const qty = Number(rawRecord?.amount ?? rawRecord?.quantity ?? 0) ?? 0;
          // cashflow sign
          let cashflow = 0;
          if (type === 'income' || type === 'transfer_in') cashflow = qty;
          else if (type === 'expense' || type === 'transfer_out') cashflow = -qty;
          else if (type === 'repay') {
            const dir = (typeof rawRecord?.direction === 'string' ? rawRecord.direction : '').toLowerCase();
            cashflow = dir === 'loan' ? qty : dir === 'borrow' ? -qty : 0;
          } else cashflow = 0; // initial/borrow/loan treated neutral

          const localCurrency = assetSym ?? 'USD';

          const row: Record<string, unknown> = {
            id: rawRecord?.id,
            date: dateISO ?? undefined,
            type,
            asset: assetSym,
            account: rawRecord?.account ?? '',
            quantity: qty,
            amount_local: qty,
            local_currency: localCurrency,
            cashflow_local: cashflow,
            counterparty: rawRecord?.counterparty ?? null,
            tag: rawRecord?.tag ?? null,
            note: rawRecord?.note ?? null,
          };
          return row as Transaction;
        });
        setTransactions(mapped);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      actions.setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters, actions]);

  useEffect(() => {
    if (isOnline) {
      void loadTransactions();
      void loadMasterData();
    }
  }, [isOnline, loadTransactions, loadMasterData]);

  // Global keyboard shortcut: 'n' to toggle Quick Add menu
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.tagName === 'INPUT' ||
        (e.target as HTMLElement)?.tagName === 'TEXTAREA' ||
        (e.target as HTMLElement)?.getAttribute('contenteditable') === 'true'
      ) {
        return; // don't hijack typing in inputs
      }
      if (e.key.toLowerCase() === 'n') {
        setIsQuickMenuOpen((s) => !s);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Click outside to close quick menu
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!isQuickMenuOpen) return;
      if (
        quickMenuRef.current &&
        !quickMenuRef.current.contains(e.target as Node)
      ) {
        setIsQuickMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isQuickMenuOpen]);

  // Removed legacy spot_buy auto price hook (Quick Add handles simple flows)

  const shouldToast = (e: unknown) =>
    !(e instanceof ApiError && e.status === 0);

  const handleQuickExpenseSubmit = async (data: unknown): Promise<void> => {
    const transactionData = data as Record<string, unknown>;
    try {
      await createExpense(transactionData);
      await loadTransactions();
      actions.setError(null);
      showSuccessToast('Expense added');
    } catch (e: unknown) {
      const msg =
        (e as { message?: string } | null)?.message ?? 'Failed to add expense';
      actions.setError(msg);
      if (shouldToast(e)) showErrorToast(msg);
      throw e;
    }
  };

  const handleQuickIncomeSubmit = async (data: unknown): Promise<void> => {
    const transactionData = data as Record<string, unknown>;
    try {
      await createIncome(transactionData);
      await loadTransactions();
      actions.setError(null);
      showSuccessToast('Income added');
    } catch (e: unknown) {
      const msg =
        (e as { message?: string } | null)?.message ?? 'Failed to add income';
      actions.setError(msg);
      if (shouldToast(e)) showErrorToast(msg);
      throw e;
    }
  };

  const handleQuickVaultSubmit = async (data: unknown): Promise<void> => {
    const vaultData = data as Record<string, unknown>;
    try {
      const name = typeof vaultData.name === 'string' ? vaultData.name.trim() : '';
      if (!name) throw new Error('Name is required');

      // 1) Create/ensure vault
      await vaultApi.createVault({ name });

      // 2) Optional initial deposit
      const asset = typeof vaultData.asset === 'string' ? vaultData.asset : 'USD';
      const depositCostNum = Number(vaultData.depositCost ?? 0) ?? 0;
      const depositQtyNum = Number(vaultData.depositQty ?? 0) ?? 0;
      const dateRaw = vaultData.date;
      const dateStr = dateRaw != null && typeof dateRaw === 'string' ? dateRaw : undefined;
      if (depositCostNum > 0) {
        if (asset.toUpperCase() === 'USD') {
          await vaultApi.depositToVault(name, { amount: depositCostNum, date: dateStr });
        } else {
          if (!(depositQtyNum > 0)) throw new Error('Deposit quantity must be > 0 for non-USD asset');
          await vaultApi.depositToVault(name, { asset, quantity: depositQtyNum, cost: depositCostNum, date: dateStr });
        }
      }

      showSuccessToast('Vault created');
      actions.setError(null);
    } catch (e: unknown) {
      const msg =
        (e as { message?: string } | null)?.message ?? 'Failed to create vault';
      actions.setError(msg);
      if (shouldToast(e)) showErrorToast(msg);
      throw e;
    }
  };

  const handleQuickInvestmentSubmit = async (data: unknown): Promise<void> => {
    const investmentData = data as Record<string, unknown>;
    try {
      const vaultId = investmentData.vaultId as string | undefined;
      if (vaultId) {
        const { quantity, cost, note } = investmentData as {
          quantity: number;
          cost: number;
          note?: string;
        };
        if (vaultId.startsWith('vault_')) {
          // Tokenized vault deposit (USD amount)
          const account = investmentData.account as string | undefined;
          await tokenizedVaultApi.deposit(vaultId, {
            amount: cost,
            notes: note,
            source_account: account,
          });
          // Also record a neutral cash movement so it shows up in Transactions table
          if (account) {
            await transactionApi.create({
              date: toISODateTime(
                investmentData.date as string | undefined
              ),
              type: 'deposit',
              asset: 'USD',
              account,
              quantity: cost,
              price_local: 1,
              counterparty: `Tokenized ${vaultId}`,
              note: note ?? null,
              fx_to_usd: 1,
              fx_to_vnd: 0,
            });
          }
        } else {
          // Legacy investment vault deposit (qty x cost)
          await vaultApi.depositToVault(vaultId, { quantity, cost, note });
          // Also reflect as a neutral deposit in Transactions if a source account is provided
          const account = investmentData.account as string | undefined;
          if (account) {
            await transactionApi.create({
              date: toISODateTime(
                investmentData.date as string | undefined
              ),
              type: 'deposit',
              asset: 'USD',
              account,
              quantity: cost,
              price_local: 1,
              counterparty: `Vault ${vaultId}`,
              note: note ?? null,
              fx_to_usd: 1,
              fx_to_vnd: 0,
            });
          }
        }
      } else {
        await createInvestment(investmentData);
      }
      await loadTransactions();
      actions.setError(null);
      showSuccessToast(
        vaultId ? 'Vault deposit recorded' : 'Investment recorded'
      );
    } catch (e: unknown) {
      const msg =
        (e as { message?: string } | null)?.message ??
        (investmentData.vaultId
          ? 'Failed to record vault deposit'
          : 'Failed to record investment');
      actions.setError(msg);
      showErrorToast(msg);
      throw e;
    }
  };

  const handleQuickInitSubmit = async (data: unknown): Promise<void> => {
    const params = data as Record<string, unknown>;
    try {
      await actionsApi.perform('init_balance', params);
      await loadTransactions();
      actions.setError(null);
      showSuccessToast('Balance initialized');
    } catch (e: unknown) {
      const msg =
        (e as { message?: string } | null)?.message ??
        'Failed to initialize balance';
      actions.setError(msg);
      showErrorToast(msg);
      throw e;
    }
  };

  const handleQuickTransferSubmit = async (data: unknown): Promise<void> => {
      const params = data as Record<string, unknown>;
      try {
        await actionsApi.perform('transfer', params);
        await loadTransactions();
        actions.setError(null);
        showSuccessToast('Transfer successful');
      } catch (e: unknown) {
        const msg =
          (e as { message?: string } | null)?.message ??
          'Transfer failed';
        actions.setError(msg);
        showErrorToast(msg);
        throw e;
      }
  };

  // Borrow/Loan/Repay helpers
  const toAssetObj = (symbol: string) => ({
    type: (symbol.toUpperCase() === 'USD' || symbol.length === 3) ? 'FIAT' as const : 'CRYPTO' as const,
    symbol: symbol.toUpperCase(),
  });

  const handleQuickBorrowSubmit = async (data: { date: string; amount: number; account?: string; asset: string; counterparty?: string; note?: string; }): Promise<void> => {
    try {
      const payload = {
        asset: toAssetObj(data.asset),
        amount: Number(data.amount),
        account: data.account ?? undefined,
        counterparty: data.counterparty ?? 'general',
        note: data.note ?? undefined,
        at: toISODateTime(data.date),
      };
      await transactionApi.borrow(payload);
      await loadTransactions();
      actions.setError(null);
      showSuccessToast('Borrow recorded');
    } catch (e: unknown) {
      const msg = (e as { message?: string } | null)?.message ?? 'Failed to record borrow';
      actions.setError(msg);
      showErrorToast(msg);
      throw e;
    }
  };

  const handleQuickLoanSubmit = async (data: { date: string; amount: number; account?: string; asset: string; counterparty?: string; note?: string; }): Promise<void> => {
    try {
      const payload = {
        asset: toAssetObj(data.asset),
        amount: Number(data.amount),
        account: data.account ?? undefined,
        counterparty: data.counterparty ?? 'general',
        note: data.note ?? undefined,
        at: toISODateTime(data.date),
      };
      await transactionApi.loan(payload);
      await loadTransactions();
      actions.setError(null);
      showSuccessToast('Loan recorded');
    } catch (e: unknown) {
      const msg = (e as { message?: string } | null)?.message ?? 'Failed to record loan';
      actions.setError(msg);
      showErrorToast(msg);
      throw e;
    }
  };

  const handleQuickRepaySubmit = async (data: { date: string; amount: number; account?: string; asset: string; counterparty?: string; note?: string; direction: 'BORROW' | 'LOAN'; }): Promise<void> => {
    try {
      const payload = {
        asset: toAssetObj(data.asset),
        amount: Number(data.amount),
        account: data.account ?? undefined,
        direction: data.direction,
        counterparty: data.counterparty ?? 'general',
        note: data.note ?? undefined,
        at: toISODateTime(data.date),
      };
      await transactionApi.repay(payload);
      await loadTransactions();
      actions.setError(null);
      showSuccessToast('Repayment recorded');
    } catch (e: unknown) {
      const msg = (e as { message?: string } | null)?.message ?? 'Failed to record repayment';
      actions.setError(msg);
      showErrorToast(msg);
      throw e;
    }
  };

  // Quick Add helpers (reuse existing toISODateTime defined above for actions)

  type QuickAddData = {
    date: string;
    type: string;
    asset: string;
    account: string;
    quantity: string;
    price_local?: string;
    counterparty?: string;
    tag?: string;
    note?: string;
    internal_flow?: boolean;
  };

  const QuickAddForm: React.FC<{ onCreated: (tx: Transaction) => void }> = ({
    onCreated,
  }) => {
    const [qa, setQa] = useState<QuickAddData>({
      date: todayStr,
      type: 'expense',
      asset: 'VND',
      account: '',
      quantity: '',
      price_local: '1',
      counterparty: '',
      tag: '',
      note: '',
      internal_flow: false,
    });
    const [invMode, setInvMode] = useState<'none' | 'stake' | 'unstake'>(
      'none'
    );
    const [invAccount, setInvAccount] = useState('');
    const [invHorizon, setInvHorizon] = useState('');
    const [invOpenOptions, setInvOpenOptions] = useState<Option[]>([]);
    const [invId, setInvId] = useState('');
    const [invIdToInfo, setInvIdToInfo] = useState<Record<string, unknown>>({});
    const [submitting, setSubmitting] = useState(false);
    const [qaError, setQaError] = useState<string | null>(null);
    const number = (s?: string) => (s ? parseFloat(String(s)) : 0);

    // Adjust defaults when type changes
    useEffect(() => {
      const t = String(qa.type || '').toLowerCase();
      if (
        t === 'expense' ||
        t === 'fee' ||
        t === 'transfer_in' ||
        t === 'transfer_out' ||
        t === 'deposit' ||
        t === 'withdraw'
      ) {
        // Treat as 1:1 local unit
        setQa((prev) => ({
          ...prev,
          asset: prev.asset || 'VND',
          price_local: '1',
        }));
      }
    }, [qa.type]);

    // Keyboard shortcuts: n to open (handled outside), esc to close, enter to submit
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (!showQuickAdd) return;
        if (e.key === 'Escape') {
          setShowQuickAdd(false);
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, []);

    const validate = (): string | null => {
      if (!qa.date) return 'Date is required';
      if (!qa.type) return 'Type is required';
      if (!qa.asset) return 'Asset is required';
      if (!qa.account) return 'Account is required';
      if (
        !qa.quantity ||
        isNaN(number(qa.quantity)) ||
        number(qa.quantity ?? 0) <= 0
      )
        return 'Valid quantity is required';
      const t = String(qa.type || '').toLowerCase();
      const needsPrice = t === 'buy' || t === 'sell';
      if (
        needsPrice &&
        (!qa.price_local ||
          isNaN(number(qa.price_local || '')) ||
          number(qa.price_local || '') <= 0)
      )
        return 'Valid price is required';
      if (invMode === 'stake') {
        if (!invAccount) return 'Investment account is required';
      }
      if (invMode === 'unstake') {
        if (!invId) return 'Select an active investment';
      }
      return null;
    };

    const submit = async (addAnother: boolean): Promise<void> => {
      const err = validate();
      if (err) {
        setQaError(err);
        return;
      }
      setQaError(null);
      try {
        setSubmitting(true);
        let created: Transaction | null = null;
        if (invMode === 'stake') {
          // Stake: create an incoming stake via investment API
          const fxUSD = 1;
          const fxVND = 1;
          const amtLocal = number(qa.quantity) * number(qa.price_local ?? '1');
          const amountUSD = amtLocal * fxUSD;
          const amountVND = amtLocal * fxVND;
          const stake = {
            date: toISODateTime(qa.date),
            type: 'stake',
            asset: qa.asset,
            account: invAccount,
            quantity: number(qa.quantity),
            price_local: number(qa.price_local ?? '1'),
            fx_to_usd: fxUSD,
            fx_to_vnd: fxVND,
            amount_usd: amountUSD,
            amount_vnd: amountVND,
            counterparty: qa.counterparty ?? null,
            tag: qa.tag ?? null,
            note: qa.note ?? null,
            horizon: invHorizon ?? null,
            investment_id: invId ?? null,
          };
          await investmentsApi.stake(stake);
          // Quick feedback: reload transactions list minimally
          await loadTransactions();
        } else if (invMode === 'unstake') {
          const info = (invIdToInfo[invId] ?? {}) as Record<string, unknown>;
          const unstakeQty = number(qa.quantity);
          const fxUSD = 1;
          const fxVND = 1;
          const amtLocal = unstakeQty * number(qa.price_local ?? '1');
          const amountUSD = amtLocal * fxUSD;
          const amountVND = amtLocal * fxVND;
          const unstake = {
            date: toISODateTime(qa.date),
            type: 'unstake',
            asset: (info.asset ?? qa.asset) as string,
            account: (info.account ?? invAccount) as string,
            quantity: unstakeQty,
            price_local: number(qa.price_local ?? '1'),
            fx_to_usd: fxUSD,
            fx_to_vnd: fxVND,
            amount_usd: amountUSD,
            amount_vnd: amountVND,
            counterparty: qa.counterparty ?? null,
            tag: qa.tag ?? null,
            note: qa.note ?? null,
            investment_id: invId,
          };
          await investmentsApi.unstake(unstake);
          await loadTransactions();
        } else {
          // Plain transaction
          const payload: Record<string, unknown> = {
            date: toISODateTime(qa.date),
            type: qa.type,
            asset: qa.asset,
            account: qa.account,
            quantity: number(qa.quantity),
            price_local: number(qa.price_local ?? '1'),
            counterparty: qa.counterparty ?? null,
            tag: qa.tag ?? null,
            note: qa.note ?? null,
            fx_to_usd: 0,
            fx_to_vnd: 0,
          };
          created = await transactionApi.create(payload) as Transaction;
          if (created) onCreated(created);
        }
        if (addAnother) {
          // Reset amount fields, keep type/account/asset for speed
          setQa((prev) => ({ ...prev, quantity: '', note: '' }));
        } else {
          setShowQuickAdd(false);
        }
        actions.setError(null);
        showSuccessToast('Transaction created');
      } catch (e: unknown) {
        const message = (e as { message?: string }).message ?? 'Failed to create';
        setQaError(message);
        actions.setError(message);
      } finally {
        setSubmitting(false);
      }
    };

    // Amount preview
    const amountLocal = number(qa.quantity) * number(qa.price_local ?? '1');

    // Load open investments when entering unstake mode
    useEffect(() => {
      const loadOpen = async () => {
        try {
          const list = (await investmentsApi.list({ is_open: true })) as Array<{
            id: string;
            deposit_date: string;
            asset: string;
            account: string;
            remaining_qty: number;
            horizon?: string;
          }>;
          const idMap: Record<string, { id: string; deposit_date: string; asset: string; account: string; remaining_qty: number; horizon?: string }> = {};
          const options: Option[] = list.map((inv) => {
            idMap[String(inv.id)] = inv;
            const dStr = (() => {
              const d = new Date(inv.deposit_date);
              return Number.isNaN(d.getTime())
                ? String(inv.deposit_date)
                : d.toISOString().split('T')[0];
            })();
            const hz = inv.horizon ? ` [${inv.horizon}]` : '';
            return {
              value: String(inv.id),
              label: `${inv.asset} @ ${inv.account}${hz} — ${dStr} — ${inv.remaining_qty} remaining`,
            } as Option;
          });
          setInvIdToInfo(idMap);
          setInvOpenOptions(options);
        } catch {
          // Ignore errors when loading open investments
        }
      };
      if (invMode === 'unstake') void loadOpen();
    }, [invMode]);

    return (
      <div className="bg-white border border-gray-200 rounded-md p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-md font-semibold">Quick Add</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Press Esc to close</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQuickAdd(false)}
            >
              Close
            </Button>
          </div>
        </div>

        {qaError && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {qaError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <DateInput
            value={qa.date}
            onChange={(v) => setQa((s) => ({ ...s, date: v }))}
          />

          <select
            value={qa.type}
            onChange={(e) => setQa((s) => ({ ...s, type: e.target.value }))}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="expense">Expense</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="transfer_in">Transfer In</option>
            <option value="transfer_out">Transfer Out</option>
            <option value="deposit">Deposit</option>
            <option value="withdraw">Withdraw</option>
            <option value="fee">Fee</option>
          </select>

          <ComboBox
            options={
              masterData.account as Array<{ value: string; label: string }>
            }
            value={qa.account}
            onChange={(v) => setQa((s) => ({ ...s, account: v }))}
            placeholder="Account"
            allowCreate
            onCreate={async (name) => {
              await adminApi.createAccount({
                name,
                type: 'bank',
                is_active: true,
              });
              const accounts = await adminApi.listAccounts();
              setMasterData((prev) => ({
                ...prev,
                account: (
                  (accounts as Array<{ name: string; type: string }>) || []
                ).map((a) => ({
                  value: a.name,
                  label: `${a.name} (${a.type})`,
                })),
              }));
            }}
          />

          <ComboBox
            options={
              masterData.asset as Array<{ value: string; label: string }>
            }
            value={qa.asset}
            onChange={(v) => setQa((s) => ({ ...s, asset: v }))}
            placeholder="Asset"
            allowCreate
            onCreate={async (symbol) => {
              await adminApi.createAsset({
                symbol,
                name: symbol,
                decimals: 0,
                is_active: true,
              });
              const assets = await adminApi.listAssets();
              setMasterData((prev) => ({
                ...prev,
                asset: (
                  (assets as Array<{ symbol: string; name: string }>) || []
                ).map((a) => ({
                  value: a.symbol,
                  label: `${a.symbol} - ${a.name}`,
                })),
              }));
            }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <input
            className="px-3 py-2 border rounded"
            placeholder="Quantity"
            type="number"
            step="any"
            value={qa.quantity}
            onChange={(e) => setQa((s) => ({ ...s, quantity: e.target.value }))}
          />
          {(qa.type === 'buy' || qa.type === 'sell') && (
            <input
              className="px-3 py-2 border rounded"
              placeholder="Price (Local)"
              type="number"
              step="any"
              value={qa.price_local}
              onChange={(e) =>
                setQa((s) => ({ ...s, price_local: e.target.value }))
              }
            />
          )}
          {!(qa.type === 'buy' || qa.type === 'sell') && (
            <input
              className="px-3 py-2 border rounded bg-gray-50"
              placeholder="Price (Local)"
              value={qa.price_local}
              readOnly
            />
          )}
        </div>

        {/* Investment section (optional) */}
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-2">
            <label className="text-sm text-gray-700">Investment</label>
            <select
              className="px-2 py-1 border rounded text-sm"
              value={invMode}
              onChange={(e) => setInvMode(e.target.value as 'none' | 'stake' | 'unstake')}
            >
              <option value="none">None</option>
              <option value="stake">Stake (open/add)</option>
              <option value="unstake">Unstake (close/partial)</option>
            </select>
          </div>
          {invMode === 'stake' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ComboBox
                options={
                  masterData.account.filter(
                    (a: unknown) =>
                      (a as { type: string }).type === 'investment'
                  ) as Array<{ value: string; label: string }>
                }
                value={invAccount}
                onChange={(v) => setInvAccount(String(v))}
                placeholder="Investment Account"
                allowCreate
                onCreate={async (name) => {
                  await adminApi.createAccount({
                    name,
                    type: 'investment',
                    is_active: true,
                  });
                  const accounts = await adminApi.listAccounts();
                  setMasterData((prev) => ({
                    ...prev,
                    account: (
                      (accounts as Array<{ name: string; type: string }>) || []
                    ).map((a) => ({
                      value: a.name,
                      label: `${a.name} (${a.type})`,
                    })),
                  }));
                }}
              />
              <select
                className="px-3 py-2 border rounded"
                value={invHorizon}
                onChange={(e) => setInvHorizon(e.target.value)}
              >
                <option value="">Horizon (optional)</option>
                <option value="short-term">Short-term</option>
                <option value="long-term">Long-term</option>
              </select>
              <input
                className="px-3 py-2 border rounded"
                placeholder="Existing Investment ID (optional)"
                value={invId}
                onChange={(e) => setInvId(e.target.value)}
              />
            </div>
          )}
          {invMode === 'unstake' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ComboBox
                options={invOpenOptions}
                value={invId}
                onChange={(v) => setInvId(String(v))}
                placeholder="Active Investment (required)"
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Investment Account (optional override)"
                value={invAccount}
                onChange={(e) => setInvAccount(e.target.value)}
              />
              <input
                className="px-3 py-2 border rounded"
                placeholder="Horizon (optional override)"
                value={invHorizon}
                onChange={(e) => setInvHorizon(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <ComboBox
            options={masterData.tag as Array<{ value: string; label: string }>}
            value={qa.tag ?? ''}
            onChange={(v) => setQa((s) => ({ ...s, tag: v }))}
            placeholder="Tag (optional)"
            allowCreate
            onCreate={async (name) => {
              await adminApi.createTag({
                name,
                category: 'General',
                is_active: true,
              });
              const tags = await adminApi.listTags();
              setMasterData((prev) => ({
                ...prev,
                tag: (
                  (tags as Array<{ name: string; category: string }>) ?? []
                ).map((t) => ({
                  value: t.name,
                  label: `${t.name} (${t.category})`,
                })),
              }));
            }}
          />
          <input
            className="px-3 py-2 border rounded"
            placeholder="Counterparty (optional)"
            value={qa.counterparty}
            onChange={(e) =>
              setQa((s) => ({ ...s, counterparty: e.target.value }))
            }
          />
          <input
            className="px-3 py-2 border rounded"
            placeholder="Note (optional)"
            value={qa.note}
            onChange={(e) => setQa((s) => ({ ...s, note: e.target.value }))}
          />
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">
            Amount (Local):{' '}
            <span className="font-semibold">
              {amountLocal ? amountLocal.toLocaleString() : '0'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                void submit(false);
              }}
              disabled={submitting}
            >
              Add
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void submit(true);
              }}
              disabled={submitting}
            >
              Add & New
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(true);
                setShowQuickAdd(false);
              }}
            >
              Advanced…
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Removed legacy Quick Actions in favor of simplified Quick Add

  const handleCreateTransaction = async (
    transactionData: Record<string, unknown>
  ): Promise<void> => {
    try {
      const newTransaction = (await transactionApi.create(
        transactionData
      )) as Transaction;
      setTransactions((prev) => [newTransaction, ...prev]);
      setShowForm(false);
      actions.setError(null);
      showSuccessToast('Transaction created successfully');
    } catch (err: unknown) {
      const msg =
        (err as { message?: string } | null)?.message ??
        'Failed to create transaction.';
      actions.setError(msg);
      if (!(err instanceof ApiError && err.status === 0)) showErrorToast(msg);
    }
  };

  const handleUpdateTransaction = async (
    transactionData: Record<string, unknown>
  ): Promise<void> => {
    try {
      if (!editingTransaction || editingTransaction.id === undefined) return;
      const updatedTransaction = await transactionApi.update(
        editingTransaction.id,
        transactionData
      );
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.id === editingTransaction.id
            ? (updatedTransaction as Transaction)
            : tx
        )
      );
      setEditingTransaction(null);
      setShowForm(false);
      actions.setError(null);
      showSuccessToast('Transaction updated successfully');
    } catch (err: unknown) {
      const msg =
        (err as { message?: string } | null)?.message ??
        'Failed to update transaction.';
      actions.setError(msg);
      showErrorToast(msg);
    }
  };

  const handleDeleteTransaction = async (id: IdType): Promise<void> => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
      await transactionApi.delete(id);
      setTransactions((prev) => prev.filter((tx) => tx.id !== id));
      actions.setError(null);
      showSuccessToast('Transaction deleted successfully');
    } catch (err: unknown) {
      const msg =
        (err as { message?: string } | null)?.message ?? 'Unknown error';
      actions.setError(msg);
      showErrorToast('Failed to delete transaction. Please try again.');
    }
  };

  const handleDeleteSelected = async (): Promise<void> => {
    const ids = Array.from(selectedIds).map(String);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected transaction(s)?`)) return;
    try {
      const res = await transactionApi.deleteMany(ids);
      const deleted = ((res as Record<string, unknown>)?.deleted ?? ids.length) as number;
      setTransactions((prev) =>
        prev.filter(
          (tx) => !(tx.id !== undefined && selectedIds.has(tx.id as IdType))
        )
      );
      setSelectedIds(new Set());
      actions.setError(null);
      showSuccessToast(`Deleted ${deleted} transaction(s)`);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Unknown error';
      actions.setError(message);
      showErrorToast('Failed to delete selected. Please try again.');
    }
  };

  const handleEditClick = (transaction: Transaction): void => {
    setEditingTransaction(transaction);
    setShowForm(true);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingTransaction(null);
  };

  const handleInlineEdit = async (
    transactionId: IdType,
    field: string,
    newValue: unknown
  ): Promise<void> => {
    try {
      // Find the transaction to update
      const transaction = transactions.find((t) => t.id === transactionId);
      if (!transaction) return;

      console.log('Inline edit:', {
        transactionId,
        field,
        newValue,
      });

      // Update local state optimistically
      const updatedTransaction: Transaction = {
        ...transaction,
        [field]: newValue,
      };
      setTransactions((prev) =>
        prev.map((t) => (t.id === transactionId ? updatedTransaction : t))
      );

      // Make API call to persist changes
      const updateData = { [field]: newValue } as Record<string, unknown>;
      await transactionApi.update(transactionId, updateData);

      actions.setError(null);
      showSuccessToast(`${field} updated successfully`);
    } catch (err: unknown) {
      console.error('Inline edit error:', err);
      const msg =
        (err as { message?: string } | null)?.message ?? 'Unknown error';
      actions.setError(`Failed to update ${field}: ${msg}`);
      showErrorToast(`Failed to update ${field}. Please try again.`);
      // Reload transactions to revert any optimistic updates
      void loadTransactions();
    }
  };

  // Helper function to get cache key for FX conversion
  const getFXCacheKey = (rowId: string, targetCurrency: string): string => {
    return `${rowId}-${targetCurrency}`;
  };

  // Helper function to convert amount using FX data from API response
  const convertAmountSync = useCallback(
    (
      row: Transaction, // Transaction or TransactionWithFX
      targetCurrency: 'USD' | 'VND'
    ): { amount: number; cashflow: number; isLoading: boolean } => {
      const rowId = String(row?.id ?? 'unknown');
      const cacheKey = getFXCacheKey(rowId, targetCurrency);

      const amountLocal = Number(row?.amount_local ?? 0);
      const localCurrency = (row?.local_currency as string) ?? 'USD';
      const cashflowLocal = Number(row?.cashflow_local ?? 0);

      // Check cached converted value first
      if (fxConversionCache.has(cacheKey)) {
        const cachedAmount = fxConversionCache.get(cacheKey);
        if (cachedAmount !== undefined) {
          return {
            amount: cachedAmount,
            cashflow: cachedAmount,
            isLoading: false,
          };
        }
      }

      // If same currency, no conversion needed
      if (localCurrency === targetCurrency) {
        return {
          amount: amountLocal,
          cashflow: cashflowLocal,
          isLoading: false,
        };
      }

      // 1) Use FX rates from backend response if available
      if (row?.fx_rates) {
        const fxRates = row.fx_rates as Record<string, number>;
        const directKey = `${localCurrency}-${targetCurrency}`;
        const rate = fxRates[directKey];
        if (rate && rate > 0) {
          const convertedAmount = amountLocal * rate;
          const convertedCashflow = cashflowLocal * rate;
          setFxConversionCache((prev) =>
            new Map(prev).set(cacheKey, convertedAmount)
          );
          return {
            amount: convertedAmount,
            cashflow: convertedCashflow,
            isLoading: false,
          };
        }
      }

      // 2) Try a cached online rate (per date)
      const dateStr = (() => {
        const raw = row?.date as string | undefined;
        if (!raw) return 'today';
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? 'today' : d.toISOString().split('T')[0];
      })();
      const rateKey = `${localCurrency}-${targetCurrency}-${dateStr}`;
      if (fxRateCache.has(rateKey)) {
        const rate = fxRateCache.get(rateKey);
        if (rate !== undefined) {
          const convertedAmount = amountLocal * rate;
          const convertedCashflow = cashflowLocal * rate;
          setFxConversionCache((prev) =>
            new Map(prev).set(cacheKey, convertedAmount)
          );
          return {
            amount: convertedAmount,
            cashflow: convertedCashflow,
            isLoading: false,
          };
        }
      }

      // 3) Kick off an async online fetch if not already loading
      if (!fxLoadingStates.get(rateKey)) {
        setFxLoadingStates((prev) => new Map(prev).set(rateKey, true));
        const rawDate = row?.date as string | undefined;
        const dt = rawDate ? new Date(rawDate) : undefined;
        void fxService
          .getFXRate(localCurrency, targetCurrency, dt)
          .then((rate) => {
            setFxRateCache((prev) => new Map(prev).set(rateKey, rate));
            const amt = amountLocal * rate;
            setFxConversionCache((prev) => new Map(prev).set(cacheKey, amt));
          })
          .catch(() => {
            // ignore, we'll fall back below
          })
          .finally(() => {
            setFxLoadingStates((prev) => new Map(prev).set(rateKey, false));
          });
      }

      // 4) Fallback while online fetch is in-flight: compute deterministic USD/VND pair fallback
      let fallbackRate = 1;
      const lc = localCurrency.toUpperCase();
      const tc = targetCurrency.toUpperCase();
      if (lc === 'USD' && tc === 'VND') fallbackRate = 24000;
      else if (lc === 'VND' && tc === 'USD') fallbackRate = 1 / 24000;
      else if (tc === 'VND')
        fallbackRate = 24000; // best-effort when converting to VND
      else fallbackRate = 1;

      const convertedAmount = amountLocal * fallbackRate;
      const convertedCashflow = cashflowLocal * fallbackRate;

      // IMPORTANT: do NOT cache the fallback so the UI can update once the online rate arrives
      return {
        amount: convertedAmount,
        cashflow: convertedCashflow,
        isLoading: true,
      };
    },
    [fxConversionCache, fxRateCache, fxLoadingStates]
  );

  const columns: TableColumn<Transaction>[] = [
    {
      key: 'date',
      title: 'Date',
      type: 'date',
      editable: true,
      editType: 'date',
      render: (_value, _column, row) => {
        const raw = (row as Record<string, unknown>)?.date ?? (row as Record<string, unknown>)?.createdAt ?? (row as Record<string, unknown>)?.at;
        if (!raw || typeof raw !== 'string') return '-';
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleDateString();
      },
    },
    {
      key: 'type',
      title: 'Type',
      editable: true,
      editType: 'select',
      render: (value, _column, row) => {
        // Normalize value
        const type = String((value as string) ?? '').toLowerCase();
        const isInternal =
          Boolean((row as Record<string, unknown>)?.internal_flow) &&
          (type === 'transfer_in' || type === 'transfer_out');

        // Categorize types for coloring
        const INFLOW_TYPES = [
          'buy',
          'income',
          'reward',
          'airdrop',
          'transfer_in',
          'repay',
          'interest',
        ];
        const OUTFLOW_TYPES = [
          'sell',
          'expense',
          'fee',
          'repay_borrow',
          'interest_expense',
          'transfer_out',
          'lend',
        ];
        const NEUTRAL_TYPES = ['deposit', 'withdraw', 'borrow'];

        const isInflow = !isInternal && INFLOW_TYPES.includes(type);
        const isOutflow = !isInternal && OUTFLOW_TYPES.includes(type);
        const isNeutral =
          isInternal ||
          NEUTRAL_TYPES.includes(type) ||
          (!isInflow && !isOutflow);

        const cls = isInflow
          ? 'bg-green-100 text-green-800'
          : isOutflow
            ? 'bg-red-100 text-red-800'
            : 'bg-gray-100 text-gray-800';

        const typeLabel = (isInternal ? 'internal' : type || 'unknown')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}
            title={
              isInternal
                ? 'Internal transfer'
                : isNeutral
                  ? 'Neutral cash flow'
                  : isInflow
                    ? 'Inflow'
                    : 'Outflow'
            }
          >
            {typeLabel}
          </span>
        );
      },
    },
    {
      key: 'asset',
      title: 'Asset',
      editable: true,
      editType: 'select',
      render: (value) => {
        if (!value) return '-';
        if (typeof value === 'string') return value;
        try {
          const v = value as Record<string, unknown>;
          if (v?.symbol && typeof v.symbol === 'string') return v.symbol;
        } catch {
          // Fall through to default handling
        }
        // Fallback - handle objects safely
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value);
        }
        if (typeof value === 'string') return value;
        return '-';
      },
    },
    {
      key: 'account',
      title: 'Account',
      editable: true,
      editType: 'select',
    },
    {
      key: 'quantity',
      title: 'Quantity',
      type: 'number',
      decimals: 8,
      editable: true,
      editType: 'number',
    },
    {
      key: 'amount',
      title: `Amount (${currency})`,
      type: 'currency',
      currency: currency,
      render: (_value, _column, row) => {
        const numberFormatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency === 'USD' || currency === 'VND' ? currency : 'USD',
        });

        const _type = (row as Record<string, unknown>).type;
        const type = typeof _type === 'string' ? _type.toLowerCase() : '';
        const isNeutral = ['deposit', 'withdraw', 'borrow'].includes(type);

        // Use synchronous conversion with stored FX rates
        const {
          amount: _convertedAmount,
          cashflow: _convertedCashflow,
        } = convertAmountSync(row, currency as 'USD' | 'VND');
        const convertedAmount = typeof _convertedAmount === 'number' ? _convertedAmount : 0;
        const convertedCashflow = typeof _convertedCashflow === 'number' ? _convertedCashflow : 0;

        // For zero amounts, return dash
        if (convertedAmount === 0 && convertedCashflow === 0) {
          return '-';
        }

        // Display converted amounts
        if (isNeutral) {
          return (
            <span className="font-medium text-gray-800">
              {numberFormatter.format(convertedAmount)}
            </span>
          );
        }

        const isPositive = convertedCashflow > 0;
        const formatted = numberFormatter.format(Math.abs(convertedCashflow));
        const sign = isPositive ? '+' : '-';
        const cls = isPositive ? 'text-green-700' : 'text-red-700';
        return (
          <span className={`font-medium ${cls}`}>{`${sign}${formatted}`}</span>
        );
      },
    },
    {
      key: 'counterparty',
      title: 'Counterparty',
      editable: true,
      editType: 'text',
    },
    {
      key: 'tag',
      title: 'Tag',
      editable: true,
      editType: 'select',
    },
    // Actions column handled by DataTable's built-in actions prop
  ];

  if (showForm) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={handleFormCancel}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Transactions
          </Button>
        </div>

        <TransactionForm
          transaction={editingTransaction as Transaction}
          onSubmit={(e) => {
            void (editingTransaction
              ? handleUpdateTransaction(e)
              : handleCreateTransaction(e));
          }}
          onCancel={handleFormCancel}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1
              className="text-2xl font-bold text-gray-900"
              data-testid="transactions-page-title"
            >
              Transactions
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Track your financial transactions with dual currency valuation and
              comprehensive reporting.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative" ref={quickMenuRef}>
              <Button
                onClick={() => setIsQuickMenuOpen((s) => !s)}
                title="Quick Add (N)"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Quick Add
                <svg
                  className="w-4 h-4 ml-2"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.173l3.71-3.942a.75.75 0 111.08 1.04l-4.243 4.5a.75.75 0 01-1.08 0l-4.243-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </Button>
              {isQuickMenuOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                  <div className="py-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        setExpenseDefaultAccount(undefined);
                        openQuickModal('expense');
                      }}
                    >
                      Expense
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        setExpenseDefaultAccount('Spend');
                        openQuickModal('expense');
                      }}
                    >
                      Cash Expense
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        setExpenseDefaultAccount('Borrowings');
                        openQuickModal('expense');
                      }}
                    >
                      Credit Expense
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        openQuickModal('income');
                      }}
                    >
                      Income
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        openQuickModal('borrowLoan');
                      }}
                    >
                      Borrow
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        openQuickModal('loan');
                      }}
                    >
                      Loan
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        openQuickModal('repay');
                      }}
                    >
                      Repay
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        openQuickModal('buy');
                      }}
                    >
                      Quick Buy
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        openQuickModal('sell');
                      }}
                    >
                      Quick Sell
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        openQuickModal('vault');
                      }}
                    >
                      New Vault
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        openQuickModal('initBalance');
                      }}
                    >
                      Init Balance
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        openQuickModal('investment');
                      }}
                    >
                      New Investment
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setIsQuickMenuOpen(false);
                        openQuickModal('transfer');
                      }}
                    >
                      Transfer
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <Button
              onClick={() => setShowForm(true)}
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Transaction
            </Button>
            <Button
              variant={selectedIds.size > 0 ? "destructive" : "secondary"}
              onClick={() => void handleDeleteSelected()}
              disabled={selectedIds.size === 0}
              title={
                selectedIds.size === 0
                  ? 'Select rows to delete'
                  : 'Delete selected'
              }
            >
              <svg
                className="w-4 h-4 mr-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-9 0h10"
                />
              </svg>
              Delete Selected
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void (async () => {
                  try {
                    setBulkRefreshing(true);
                    await adminApi.recalcFX(false);
                    await loadTransactions();
                    showSuccessToast('Refreshed derived fields (missing only)');
                  } catch {
                    showErrorToast('Refresh failed');
                  } finally {
                    setBulkRefreshing(false);
                  }
                })();
              }}
              disabled={bulkRefreshing}
            >
              {bulkRefreshing ? (
                <svg
                  className="w-4 h-4 mr-2 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0019 5"
                  />
                </svg>
              )}
              {bulkRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button variant="outline">
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Add Panel */}
      {/* Replace inline Quick Add panel with modals: leaving toggle available for power users */}
      {false && showQuickAdd && (
        <div className="mb-6">
          <QuickAddForm
            onCreated={(tx) => setTransactions((prev) => [tx, ...prev])}
          />
        </div>
      )}

      {/* Currency Toggle */}
      <div className="mb-6">
        <div className="inline-flex rounded-md shadow-sm">
          <Button
            variant={currency === 'USD' ? 'default' : 'outline'}
            className="rounded-r-none"
            onClick={() => actions.setCurrency('USD')}
          >
            USD View
          </Button>
          <Button
            variant={currency === 'VND' ? 'default' : 'outline'}
            className="rounded-l-none"
            onClick={() => actions.setCurrency('VND')}
          >
            VND View
          </Button>
        </div>
      </div>

      {/* Quick Actions removed */}

      {/* Transactions Table */}
      <DataTable
        data={transactions}
        columns={columns}
        loading={loading}
        error={error}
        emptyMessage="No transactions found. Create your first transaction above."
        editable={true}
        onCellEdit={handleInlineEdit}
        masterData={masterData}
        onRowClick={null}
        actions={['edit', 'delete', 'recalc']}
        onEdit={handleEditClick}
        onDelete={handleDeleteTransaction}
        busyRowIds={busyRowIds}
        selectableRows={true}
        selectedIds={selectedIds}
        onToggleRow={(id, checked) => {
          setSelectedIds((s) => {
            const next = new Set(s);
            if (checked) next.add(id as IdType);
            else next.delete(id as IdType);
            return next;
          });
        }}
        onToggleAll={(checked, visibleIds) => {
          setSelectedIds((s) => {
            const next = new Set(s);
            for (const id of visibleIds) {
              if (checked) next.add(id as IdType);
              else next.delete(id as IdType);
            }
            return next;
          });
        }}
        onRecalc={async (row) => {
          try {
            setBusyRowIds((s) => {
              const next = new Set(s);
              next.add(row.id as IdType);
              return next;
            });
            const updated = await transactionApi.recalc(String(row.id), false);
            if (updated) {
              setTransactions((prev) =>
                prev.map((t) =>
                  t.id === row.id ? (updated as Transaction) : t
                )
              );
              showSuccessToast('Row refreshed');
            } else {
              await loadTransactions();
            }
          } catch {
            showErrorToast('Row refresh failed');
          } finally {
            setBusyRowIds((s) => {
              const next = new Set(s);
              next.delete(row.id as IdType);
              return next;
            });
          }
        }}
      />

      <QuickExpenseModal
        isOpen={isModalOpen('expense')}
        onClose={closeQuickModal}
        onSubmit={handleQuickExpenseSubmit}
        defaultAccount={expenseDefaultAccount}
      />
      <QuickIncomeModal
        isOpen={isModalOpen('income')}
        onClose={closeQuickModal}
        onSubmit={(d) => void handleQuickIncomeSubmit(d)}
      />
      <QuickVaultModal
        isOpen={isModalOpen('vault')}
        onClose={closeQuickModal}
        onSubmit={(d) => void handleQuickVaultSubmit(d)}
      />
      <QuickInvestmentModal
        isOpen={isModalOpen('investment')}
        onClose={closeQuickModal}
        onSubmit={(d) => void handleQuickInvestmentSubmit(d)}
      />
      <QuickInitBalanceModal
        isOpen={isModalOpen('initBalance')}
        onClose={closeQuickModal}
        onSubmit={(d) => void handleQuickInitSubmit(d)}
      />
      <QuickTransferModal
        isOpen={isModalOpen('transfer')}
        onClose={closeQuickModal}
        onSubmit={(d) => void handleQuickTransferSubmit(d)}
      />
      <QuickBuyModal
        isOpen={isModalOpen('buy')}
        onClose={closeQuickModal}
        onSubmitted={() => {
          void (async () => {
            await loadTransactions();
            showSuccessToast('Buy recorded');
          })();
        }}
      />
      <QuickSellModal
        isOpen={isModalOpen('sell')}
        onClose={closeQuickModal}
        onSubmitted={() => {
          void (async () => {
            await loadTransactions();
            showSuccessToast('Sell recorded');
          })();
        }}
      />
      <QuickBorrowLoanModal
        isOpen={isModalOpen('borrowLoan')}
        mode="borrow"
        onClose={closeQuickModal}
        onSubmit={(d) => {
          void handleQuickBorrowSubmit(d);
        }}
      />
      <QuickBorrowLoanModal
        isOpen={isModalOpen('loan')}
        mode="loan"
        onClose={closeQuickModal}
        onSubmit={(d) => {
          void handleQuickLoanSubmit(d);
        }}
      />
      <QuickRepayModal
        isOpen={isModalOpen('repay')}
        onClose={closeQuickModal}
        onSubmit={(d) => {
          void handleQuickRepaySubmit(d);
        }}
      />
      {quickError && (
        <div className="mt-3 text-sm text-red-700">{quickError}</div>
      )}
    </div>
  );
};

export default TransactionPage;
