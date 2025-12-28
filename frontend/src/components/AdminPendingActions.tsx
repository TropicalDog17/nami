import { useCallback, useEffect, useMemo, useState } from 'react';

import { useApp } from '../context/AppContext';
import { adminApi } from '../services/api';

// Custom tooltip component for action details
const ActionTooltip = ({ children, content }: { children: React.ReactNode; content: string }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8,
      left: rect.left,
    });
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 max-w-sm pointer-events-none"
          style={{ top: `${position.top}px`, left: `${position.left}px` }}
        >
          <pre className="whitespace-pre-wrap font-sans leading-relaxed">{content}</pre>
        </div>
      )}
    </div>
  );
};

type PendingStatus = 'pending' | 'accepted' | 'rejected';

type PendingAction = {
  id: string;
  source: string;
  raw_input: string;
  toon_text?: string | null;
  confidence?: number | null;
  status: PendingStatus;
  batch_id?: string | null;
  action_json?: unknown;
  meta?: unknown;
  created_tx_ids?: string[];
  error?: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS: Array<{ value: PendingStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

type ActionJson = {
  action?: string;
  params?: {
    account?: string | null;
    vnd_amount?: number | null;
    date?: string | null;
    counterparty?: string | null;
    tag?: string | null;
    note?: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const formatJson = (value: unknown): string => {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch (_) {
      return value;
    }
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  if (value === null || value === undefined) return '—';
  return String(value);
};

const getActionSummary = (value: unknown, fallbackToon?: string | null): string => {
  let parsed: ActionJson | null = null;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as ActionJson;
    } catch {
      // ignore parse error, we'll fall back below
    }
  } else if (value && typeof value === 'object') {
    parsed = value as ActionJson;
  }

  if (parsed && typeof parsed === 'object') {
    const action = parsed.action ?? 'unknown_action';
    const params = parsed.params ?? {};
    const amount = params.vnd_amount ?? null;
    const date = params.date ?? null;
    const tag = params.tag ?? null;
    const counterparty = params.counterparty ?? null;

    // Convert action to readable format
    const actionLabels: Record<string, string> = {
      spend_vnd: '💸 Expense',
      income_vnd: '💰 Income',
      credit_spend_vnd: '💳 Credit',
      card_payment_vnd: '💳 Payment',
    };
    const actionLabel = actionLabels[action] || action;

    // Format amount compactly
    const amountLabel = typeof amount === 'number'
      ? amount >= 1_000_000
        ? `${(amount / 1_000_000).toFixed(1)}M`
        : amount >= 1_000
        ? `${(amount / 1_000).toFixed(0)}K`
        : `${amount}`
      : '—';

    // Build pieces with counterparty first
    const pieces = [
      counterparty,
      amountLabel,
      date,
      tag,
    ].filter(Boolean);

    return `${actionLabel}: ${pieces.join(' • ')}`;
  }

  if (fallbackToon) {
    const trimmed = fallbackToon.trim();
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
  }

  return '—';
};

const getActionTooltip = (value: unknown, fallbackToon?: string | null): string => {
  let parsed: ActionJson | null = null;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as ActionJson;
    } catch {
      // ignore parse error, we'll fall back below
    }
  } else if (value && typeof value === 'object') {
    parsed = value as ActionJson;
  }

  if (parsed && typeof parsed === 'object') {
    const action = parsed.action ?? 'unknown_action';
    const params = parsed.params ?? {};
    const amount = params.vnd_amount ?? null;
    const date = params.date ?? null;
    const tag = params.tag ?? null;
    const counterparty = params.counterparty ?? null;
    const account = params.account ?? null;
    const note = params.note ?? null;

    const actionLabels: Record<string, string> = {
      spend_vnd: 'Expense',
      income_vnd: 'Income',
      credit_spend_vnd: 'Credit Expense',
      card_payment_vnd: 'Card Payment',
    };
    const actionLabel = actionLabels[action] || action;

    // Format full amount
    const amountLabel = typeof amount === 'number'
      ? `${amount.toLocaleString('en-US')} VND`
      : '—';

    const lines = [
      `Type: ${actionLabel}`,
      amount !== null ? `Amount: ${amountLabel}` : null,
      counterparty ? `Merchant: ${counterparty}` : null,
      date ? `Date: ${date}` : null,
      tag ? `Category: ${tag}` : null,
      account ? `Account: ${account}` : null,
      note ? `Note: ${note}` : null,
    ].filter(Boolean);

    return lines.join('\n');
  }

  if (fallbackToon) {
    return fallbackToon.trim();
  }

  return '—';
};

export const AdminPendingActions = () => {
  const { actions } = useApp();
  const [statusFilter, setStatusFilter] = useState<PendingStatus>('pending');
  const [items, setItems] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<PendingAction | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi.listPendingActions<PendingAction[]>({
        status: statusFilter,
        limit: 100,
      });
      setItems(Array.isArray(result) ? result : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      actions.setError(`Failed to load pending actions: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [actions, statusFilter]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const loadDetails = useCallback(
    async (id: string) => {
      setDetailsLoading(true);
      try {
        const result = await adminApi.getPendingAction<PendingAction>(id);
        if (result) {
          setSelectedDetails(result);
        } else {
          const fallback = items.find((item) => item.id === id) ?? null;
          setSelectedDetails(fallback);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        actions.setError(`Failed to fetch details: ${message}`);
      } finally {
        setDetailsLoading(false);
      }
    },
    [actions, items]
  );

  const handleView = async (item: PendingAction) => {
    if (selectedId === item.id && selectedDetails) {
      // Toggle off if already selected
      setSelectedId(null);
      setSelectedDetails(null);
      return;
    }
    setSelectedId(item.id);
    await loadDetails(item.id);
  };

  const handleAccept = async (item: PendingAction) => {
    if (item.status !== 'pending') {
      actions.setError('Only pending items can be accepted.');
      return;
    }
    if (!confirm(`Accept pending action ${item.id}?`)) return;
    setBusyActionId(item.id);
    try {
      await adminApi.acceptPendingAction(item.id);
      actions.setSuccess(`Pending action ${item.id} accepted.`);
      await loadPending();
      if (selectedId === item.id) {
        await loadDetails(item.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      actions.setError(`Failed to accept action: ${message}`);
    } finally {
      setBusyActionId((current) => (current === item.id ? null : current));
    }
  };

  const handleReject = async (item: PendingAction) => {
    if (item.status !== 'pending') {
      actions.setError('Only pending items can be rejected.');
      return;
    }
    if (!confirm(`Reject pending action ${item.id}?`)) return;
    setBusyActionId(item.id);
    try {
      await adminApi.rejectPendingAction(item.id);
      actions.setSuccess(`Pending action ${item.id} rejected.`);
      await loadPending();
      if (selectedId === item.id) {
        await loadDetails(item.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      actions.setError(`Failed to reject action: ${message}`);
    } finally {
      setBusyActionId((current) => (current === item.id ? null : current));
    }
  };

  const handleAcceptAll = async () => {
    if (!confirm('Accept all pending actions?')) return;
    setBulkBusy(true);
    try {
      const result = await adminApi.acceptAllPendingActions();
      const count = (result as { accepted?: number })?.accepted ?? 0;
      actions.setSuccess(`${count} pending action(s) accepted.`);
      await loadPending();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      actions.setError(`Failed to accept all: ${message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleRejectAll = async () => {
    if (!confirm('Reject all pending actions?')) return;
    setBulkBusy(true);
    try {
      const result = await adminApi.rejectAllPendingActions();
      const count = (result as { rejected?: number })?.rejected ?? 0;
      actions.setSuccess(`${count} pending action(s) rejected.`);
      await loadPending();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      actions.setError(`Failed to reject all: ${message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return selectedDetails ?? items.find((item) => item.id === selectedId) ?? null;
  }, [items, selectedDetails, selectedId]);

  const renderStatusBadge = (status: PendingStatus) => {
    const classes: Record<PendingStatus, string> = {
      pending: 'bg-amber-100 text-amber-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${classes[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">AI Pending Actions</h2>
          <p className="text-sm text-gray-500">
            Review, accept, or reject actions generated from Telegram inputs.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col text-sm text-gray-600">
            Status Filter
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PendingStatus)}
              className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadPending()}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            disabled={loading || bulkBusy}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          {statusFilter === 'pending' && (
            <>
              <button
                type="button"
                onClick={() => void handleAcceptAll()}
                className="inline-flex items-center rounded-md border border-green-600 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 shadow-sm hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading || bulkBusy}
              >
                {bulkBusy ? 'Processing…' : 'Accept All'}
              </button>
              <button
                type="button"
                onClick={() => void handleRejectAll()}
                className="inline-flex items-center rounded-md border border-red-600 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading || bulkBusy}
              >
                {bulkBusy ? 'Processing…' : 'Reject All'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Source
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Confidence
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Action
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Raw Input
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Created
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                  Loading pending actions…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                  No pending actions found for this filter.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-gray-50 ${selectedId === item.id ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">
                    {item.id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{item.source}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {item.confidence != null
                      ? `${(Number(item.confidence) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-sm text-gray-700">
                    <ActionTooltip content={getActionTooltip(item.action_json, item.toon_text)}>
                      <span className="block truncate cursor-help">
                        {getActionSummary(item.action_json, item.toon_text)}
                      </span>
                    </ActionTooltip>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {item.raw_input.slice(0, 80)}
                    {item.raw_input.length > 80 ? '…' : ''}
                  </td>
                  <td className="px-4 py-3 text-sm">{renderStatusBadge(item.status)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleView(item)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        {selectedId === item.id ? 'Hide' : 'View'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAccept(item)}
                        disabled={item.status !== 'pending' || busyActionId === item.id}
                        className="rounded-md border border-green-600 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReject(item)}
                        disabled={item.status !== 'pending' || busyActionId === item.id}
                        className="rounded-md border border-red-600 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Details</h3>
            <p className="text-sm text-gray-500">
              Select a pending action to inspect the raw data and suggested action payload.
            </p>
          </div>
          {detailsLoading && <span className="text-sm text-gray-500">Loading details…</span>}
        </div>

        {selected ? (
          <div className="mt-4 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-700">Action JSON (parsed)</h4>
              <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-white p-3 text-xs text-gray-900 shadow-inner">
                {formatJson(selected.action_json)}
              </pre>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700">Raw Input</h4>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-white p-3 text-sm text-gray-900 shadow-inner">
                {selected.raw_input}
              </p>
            </div>
            {selected.toon_text && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700">LLM Summary (TOON)</h4>
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-white p-3 text-sm text-gray-900 shadow-inner">
                  {selected.toon_text}
                </p>
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold text-gray-700">Meta</h4>
              <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-white p-3 text-xs text-gray-900 shadow-inner">
                {formatJson(selected.meta)}
              </pre>
            </div>
            {Array.isArray(selected.created_tx_ids) && selected.created_tx_ids.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700">Created Transactions</h4>
                <ul className="mt-1 list-disc pl-6 text-sm text-gray-900">
                  {selected.created_tx_ids.map((txId) => (
                    <li key={txId} className="font-mono">
                      {txId}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">No pending action selected.</p>
        )}
      </div>
    </div>
  );
};

export default AdminPendingActions;

