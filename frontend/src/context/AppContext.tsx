/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';

import { adminApi } from '../services/api';
import { useBackendStatus } from './BackendStatusContext';

type TransactionType = {
  id?: string | number;
  name: string;
  description?: string;
  is_active: boolean;
};

type Account = {
  id?: string | number;
  name: string;
  type?: string;
  is_active: boolean;
};

type Asset = {
  id?: string | number;
  symbol: string;
  name?: string;
  is_active: boolean;
};

type Tag = {
  id?: string | number;
  name: string;
  category?: string;
  is_active: boolean;
};

type AppState = {
  // Master data
  transactionTypes: TransactionType[];
  accounts: Account[];
  assets: Asset[];
  tags: Tag[];

  // UI state
  loading: boolean;
  error: string | null;
  success: string | null;

  // Settings
  currency: 'USD' | 'VND'; // 'USD' or 'VND'

  // Cache timestamps
  lastUpdated: {
    transactionTypes: Date | null;
    accounts: Date | null;
    assets: Date | null;
    tags: Date | null;
  };
};

// Initial state
const initialState: AppState = {
  transactionTypes: [],
  accounts: [],
  assets: [],
  tags: [],
  loading: false,
  error: null,
  success: null,
  currency: 'USD',
  lastUpdated: {
    transactionTypes: null,
    accounts: null,
    assets: null,
    tags: null,
  },
};

// Action types
const ActionTypes = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_SUCCESS: 'SET_SUCCESS',
  CLEAR_SUCCESS: 'CLEAR_SUCCESS',
  SET_CURRENCY: 'SET_CURRENCY',
  SET_TRANSACTION_TYPES: 'SET_TRANSACTION_TYPES',
  SET_ACCOUNTS: 'SET_ACCOUNTS',
  SET_ASSETS: 'SET_ASSETS',
  SET_TAGS: 'SET_TAGS',
  ADD_TRANSACTION_TYPE: 'ADD_TRANSACTION_TYPE',
  UPDATE_TRANSACTION_TYPE: 'UPDATE_TRANSACTION_TYPE',
  DELETE_TRANSACTION_TYPE: 'DELETE_TRANSACTION_TYPE',
  ADD_ACCOUNT: 'ADD_ACCOUNT',
  UPDATE_ACCOUNT: 'UPDATE_ACCOUNT',
  DELETE_ACCOUNT: 'DELETE_ACCOUNT',
  ADD_ASSET: 'ADD_ASSET',
  UPDATE_ASSET: 'UPDATE_ASSET',
  DELETE_ASSET: 'DELETE_ASSET',
  ADD_TAG: 'ADD_TAG',
  UPDATE_TAG: 'UPDATE_TAG',
  DELETE_TAG: 'DELETE_TAG',
} as const;

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_SUCCESS'; payload: string | null }
  | { type: 'CLEAR_SUCCESS' }
  | { type: 'SET_CURRENCY'; payload: 'USD' | 'VND' }
  | { type: 'SET_TRANSACTION_TYPES'; payload: TransactionType[] }
  | { type: 'SET_ACCOUNTS'; payload: Account[] }
  | { type: 'SET_ASSETS'; payload: Asset[] }
  | { type: 'SET_TAGS'; payload: Tag[] }
  | { type: 'ADD_TRANSACTION_TYPE'; payload: TransactionType }
  | { type: 'UPDATE_TRANSACTION_TYPE'; payload: TransactionType & { id?: string | number } }
  | { type: 'DELETE_TRANSACTION_TYPE'; payload: string | number }
  | { type: 'ADD_ACCOUNT'; payload: Account }
  | { type: 'UPDATE_ACCOUNT'; payload: Account & { id?: string | number } }
  | { type: 'DELETE_ACCOUNT'; payload: string | number }
  | { type: 'ADD_ASSET'; payload: Asset }
  | { type: 'UPDATE_ASSET'; payload: Asset & { id?: string | number } }
  | { type: 'DELETE_ASSET'; payload: string | number }
  | { type: 'ADD_TAG'; payload: Tag }
  | { type: 'UPDATE_TAG'; payload: Tag & { id?: string | number } }
  | { type: 'DELETE_TAG'; payload: string | number };

// Reducer
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case ActionTypes.SET_LOADING:
      return { ...state, loading: action.payload };

    case ActionTypes.SET_ERROR:
      return { ...state, error: action.payload, loading: false, success: null };

    case ActionTypes.CLEAR_ERROR:
      return { ...state, error: null };

    case ActionTypes.SET_SUCCESS:
      return { ...state, success: action.payload, error: null };

    case ActionTypes.CLEAR_SUCCESS:
      return { ...state, success: null };

    case ActionTypes.SET_CURRENCY:
      return { ...state, currency: action.payload };

    case ActionTypes.SET_TRANSACTION_TYPES:
      return {
        ...state,
        transactionTypes: action.payload,
        lastUpdated: { ...state.lastUpdated, transactionTypes: new Date() },
      };

    case ActionTypes.SET_ACCOUNTS:
      return {
        ...state,
        accounts: action.payload,
        lastUpdated: { ...state.lastUpdated, accounts: new Date() },
      };

    case ActionTypes.SET_ASSETS:
      return {
        ...state,
        assets: action.payload,
        lastUpdated: { ...state.lastUpdated, assets: new Date() },
      };

    case ActionTypes.SET_TAGS:
      return {
        ...state,
        tags: action.payload,
        lastUpdated: { ...state.lastUpdated, tags: new Date() },
      };

    case ActionTypes.ADD_TRANSACTION_TYPE:
      return {
        ...state,
        transactionTypes: [...state.transactionTypes, action.payload],
      };

    case ActionTypes.UPDATE_TRANSACTION_TYPE:
      return {
        ...state,
        transactionTypes: state.transactionTypes.map((type) =>
          type.id === (action.payload as TransactionType & { id: string | number }).id ? action.payload : type
        ),
      };

    case ActionTypes.DELETE_TRANSACTION_TYPE:
      return {
        ...state,
        transactionTypes: state.transactionTypes.filter(
          (type) => type.id !== action.payload
        ),
      };

    case ActionTypes.ADD_ACCOUNT:
      return {
        ...state,
        accounts: [...state.accounts, action.payload],
      };

    case ActionTypes.UPDATE_ACCOUNT:
      return {
        ...state,
        accounts: state.accounts.map((account) =>
          account.id === (action.payload as Account & { id: string | number }).id ? action.payload : account
        ),
      };

    case ActionTypes.DELETE_ACCOUNT:
      return {
        ...state,
        accounts: state.accounts.filter(
          (account) => account.id !== action.payload
        ),
      };

    case ActionTypes.ADD_ASSET:
      return {
        ...state,
        assets: [...state.assets, action.payload],
      };

    case ActionTypes.UPDATE_ASSET:
      return {
        ...state,
        assets: state.assets.map((asset) =>
          asset.id === (action.payload as Asset & { id: string | number }).id ? action.payload : asset
        ),
      };

    case ActionTypes.DELETE_ASSET:
      return {
        ...state,
        assets: state.assets.filter((asset) => asset.id !== action.payload),
      };

    case ActionTypes.ADD_TAG:
      return {
        ...state,
        tags: [...state.tags, action.payload],
      };

    case ActionTypes.UPDATE_TAG:
      return {
        ...state,
        tags: state.tags.map((tag) =>
          tag.id === (action.payload as Tag & { id: string | number }).id ? action.payload : tag
        ),
      };

    case ActionTypes.DELETE_TAG:
      return {
        ...state,
        tags: state.tags.filter((tag) => tag.id !== action.payload),
      };

    default:
      return state;
  }
}

type Actions = {
  setLoading: (loading: boolean) => void;
  setError: (msg: string | null) => void;
  clearError: () => void;
  setSuccess: (msg: string | null) => void;
  clearSuccess: () => void;
  setCurrency: (currency: 'USD' | 'VND') => void;
  loadTransactionTypes: () => Promise<void>;
  loadAccounts: () => Promise<void>;
  loadAssets: () => Promise<void>;
  loadTags: () => Promise<void>;
  loadAllMasterData: () => Promise<void>;
  createTransactionType: (type: TransactionType) => Promise<TransactionType>;
  updateTransactionType: (id: string | number, type: TransactionType) => Promise<TransactionType & { id: string | number }>;
  deleteTransactionType: (id: string | number) => Promise<void>;
  createAccount: (account: Account) => Promise<Account>;
  updateAccount: (id: string | number, account: Account) => Promise<Account & { id: string | number }>;
  deleteAccount: (id: string | number) => Promise<void>;
  createAsset: (asset: Asset) => Promise<Asset>;
  updateAsset: (id: string | number, asset: Asset) => Promise<Asset & { id: string | number }>;
  deleteAsset: (id: string | number) => Promise<void>;
  createTag: (tag: Tag) => Promise<Tag>;
  updateTag: (id: string | number, tag: Tag) => Promise<Tag & { id: string | number }>;
  deleteTag: (id: string | number) => Promise<void>;
};

type AppContextValue = AppState & { actions: Actions };

// Context
const AppContext = createContext<AppContextValue | undefined>(undefined);

// Provider component
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { isOnline } = useBackendStatus();

  // Action creators
  const actions: Actions = useMemo(() => ({
    setLoading: (loading) =>
      dispatch({ type: ActionTypes.SET_LOADING, payload: loading }),
    setError: (msg) =>
      dispatch({ type: ActionTypes.SET_ERROR, payload: msg }),
    clearError: () => dispatch({ type: ActionTypes.CLEAR_ERROR }),
    setSuccess: (message) =>
      dispatch({ type: ActionTypes.SET_SUCCESS, payload: message }),
    clearSuccess: () => dispatch({ type: ActionTypes.CLEAR_SUCCESS }),
    setCurrency: (currency) =>
      dispatch({ type: ActionTypes.SET_CURRENCY, payload: currency }),

    // Load master data
    loadTransactionTypes: async () => {
      try {
        dispatch({ type: ActionTypes.SET_LOADING, payload: true });
        const types = await adminApi.listTypes() as TransactionType[];
        dispatch({ type: ActionTypes.SET_TRANSACTION_TYPES, payload: types });
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to load types';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
      } finally {
        dispatch({ type: ActionTypes.SET_LOADING, payload: false });
      }
    },

    loadAccounts: async () => {
      try {
        dispatch({ type: ActionTypes.SET_LOADING, payload: true });
        const accountsData = await adminApi.listAccounts() as Account[];
        dispatch({ type: ActionTypes.SET_ACCOUNTS, payload: accountsData });
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to load accounts';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
      } finally {
        dispatch({ type: ActionTypes.SET_LOADING, payload: false });
      }
    },

    loadAssets: async () => {
      try {
        dispatch({ type: ActionTypes.SET_LOADING, payload: true });
        const assetsData = await adminApi.listAssets() as Asset[];
        dispatch({ type: ActionTypes.SET_ASSETS, payload: assetsData });
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to load assets';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
      } finally {
        dispatch({ type: ActionTypes.SET_LOADING, payload: false });
      }
    },

    loadTags: async () => {
      try {
        dispatch({ type: ActionTypes.SET_LOADING, payload: true });
        const tagsData = await adminApi.listTags() as Tag[];
        dispatch({ type: ActionTypes.SET_TAGS, payload: tagsData });
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to load tags';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
      } finally {
        dispatch({ type: ActionTypes.SET_LOADING, payload: false });
      }
    },

    loadAllMasterData: async () => {
      try {
        dispatch({ type: ActionTypes.SET_LOADING, payload: true });
        const [types, accounts, assets, tags] = await Promise.all([
          adminApi.listTypes() as Promise<TransactionType[]>,
          adminApi.listAccounts() as Promise<Account[]>,
          adminApi.listAssets() as Promise<Asset[]>,
          adminApi.listTags() as Promise<Tag[]>,
        ]);

        dispatch({ type: ActionTypes.SET_TRANSACTION_TYPES, payload: types });
        dispatch({ type: ActionTypes.SET_ACCOUNTS, payload: accounts });
        dispatch({ type: ActionTypes.SET_ASSETS, payload: assets });
        dispatch({ type: ActionTypes.SET_TAGS, payload: tags });
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to load data';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
      } finally {
        dispatch({ type: ActionTypes.SET_LOADING, payload: false });
      }
    },

    // CRUD operations
    createTransactionType: async (type: TransactionType) => {
      try {
        const newType = await adminApi.createType(type) as TransactionType;
        dispatch({ type: ActionTypes.ADD_TRANSACTION_TYPE, payload: newType });
        return newType;
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to create type';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    updateTransactionType: async (id: string | number, type: TransactionType) => {
      try {
        const updatedType = await adminApi.updateType(id, type) as TransactionType & { id: string | number };
        dispatch({
          type: ActionTypes.UPDATE_TRANSACTION_TYPE,
          payload: updatedType,
        });
        return updatedType;
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to update type';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    deleteTransactionType: async (id: string | number) => {
      try {
        await adminApi.deleteType(id);
        dispatch({ type: ActionTypes.DELETE_TRANSACTION_TYPE, payload: id });
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to delete type';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    createAccount: async (account: Account) => {
      try {
        const newAccount = await adminApi.createAccount(account) as Account;
        dispatch({ type: ActionTypes.ADD_ACCOUNT, payload: newAccount });
        return newAccount;
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to create account';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    updateAccount: async (id: string | number, account: Account) => {
      try {
        const updatedAccount = await adminApi.updateAccount(id, account) as Account & { id: string | number };
        dispatch({ type: ActionTypes.UPDATE_ACCOUNT, payload: updatedAccount });
        return updatedAccount;
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to update account';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    deleteAccount: async (id: string | number) => {
      try {
        await adminApi.deleteAccount(id);
        dispatch({ type: ActionTypes.DELETE_ACCOUNT, payload: id });
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to delete account';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    createAsset: async (asset: Asset) => {
      try {
        const newAsset = await adminApi.createAsset(asset) as Asset;
        dispatch({ type: ActionTypes.ADD_ASSET, payload: newAsset });
        return newAsset;
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to create asset';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    updateAsset: async (id: string | number, asset: Asset) => {
      try {
        const updatedAsset = await adminApi.updateAsset(id, asset) as Asset & { id: string | number };
        dispatch({ type: ActionTypes.UPDATE_ASSET, payload: updatedAsset });
        return updatedAsset;
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to update asset';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    deleteAsset: async (id: string | number) => {
      try {
        await adminApi.deleteAsset(id);
        dispatch({ type: ActionTypes.DELETE_ASSET, payload: id });
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to delete asset';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    createTag: async (tag: Tag) => {
      try {
        const newTag = await adminApi.createTag(tag) as Tag;
        dispatch({ type: ActionTypes.ADD_TAG, payload: newTag });
        return newTag;
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to create tag';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    updateTag: async (id: string | number, tag: Tag) => {
      try {
        const updatedTag = await adminApi.updateTag(id, tag) as Tag & { id: string | number };
        dispatch({ type: ActionTypes.UPDATE_TAG, payload: updatedTag });
        return updatedTag;
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to update tag';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },

    deleteTag: async (id: string | number) => {
      try {
        await adminApi.deleteTag(id);
        dispatch({ type: ActionTypes.DELETE_TAG, payload: id });
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? 'Failed to delete tag';
        dispatch({ type: ActionTypes.SET_ERROR, payload: msg });
        throw err;
      }
    },
  }), [dispatch]);

  // Load master data on mount
  const loadAllMasterData = useCallback(async () => {
    await actions.loadAllMasterData();
  }, [actions]);

  useEffect(() => {
    if (isOnline) {
      void loadAllMasterData();
    }
  }, [isOnline, loadAllMasterData]);

  const value: AppContextValue = {
    ...state,
    actions,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Hook to use the context
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

export default AppContext;
