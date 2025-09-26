import React, { createContext, useContext, useReducer, useEffect } from 'react'
import { adminApi } from '../services/api'

// Initial state
const initialState = {
  // Master data
  transactionTypes: [],
  accounts: [],
  assets: [],
  tags: [],
  
  // UI state
  loading: false,
  error: null,
  
  // Settings
  currency: 'USD', // 'USD' or 'VND'
  
  // Cache timestamps
  lastUpdated: {
    transactionTypes: null,
    accounts: null,
    assets: null,
    tags: null,
  }
}

// Action types
const ActionTypes = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
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
}

// Reducer
function appReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_LOADING:
      return { ...state, loading: action.payload }
      
    case ActionTypes.SET_ERROR:
      return { ...state, error: action.payload, loading: false }
      
    case ActionTypes.CLEAR_ERROR:
      return { ...state, error: null }
      
    case ActionTypes.SET_CURRENCY:
      return { ...state, currency: action.payload }
      
    case ActionTypes.SET_TRANSACTION_TYPES:
      return {
        ...state,
        transactionTypes: action.payload,
        lastUpdated: { ...state.lastUpdated, transactionTypes: new Date() }
      }
      
    case ActionTypes.SET_ACCOUNTS:
      return {
        ...state,
        accounts: action.payload,
        lastUpdated: { ...state.lastUpdated, accounts: new Date() }
      }
      
    case ActionTypes.SET_ASSETS:
      return {
        ...state,
        assets: action.payload,
        lastUpdated: { ...state.lastUpdated, assets: new Date() }
      }
      
    case ActionTypes.SET_TAGS:
      return {
        ...state,
        tags: action.payload,
        lastUpdated: { ...state.lastUpdated, tags: new Date() }
      }
      
    case ActionTypes.ADD_TRANSACTION_TYPE:
      return {
        ...state,
        transactionTypes: [...state.transactionTypes, action.payload]
      }
      
    case ActionTypes.UPDATE_TRANSACTION_TYPE:
      return {
        ...state,
        transactionTypes: state.transactionTypes.map(type =>
          type.id === action.payload.id ? action.payload : type
        )
      }
      
    case ActionTypes.DELETE_TRANSACTION_TYPE:
      return {
        ...state,
        transactionTypes: state.transactionTypes.filter(type => type.id !== action.payload)
      }
      
    case ActionTypes.ADD_ACCOUNT:
      return {
        ...state,
        accounts: [...state.accounts, action.payload]
      }
      
    case ActionTypes.UPDATE_ACCOUNT:
      return {
        ...state,
        accounts: state.accounts.map(account =>
          account.id === action.payload.id ? action.payload : account
        )
      }
      
    case ActionTypes.DELETE_ACCOUNT:
      return {
        ...state,
        accounts: state.accounts.filter(account => account.id !== action.payload)
      }
      
    case ActionTypes.ADD_ASSET:
      return {
        ...state,
        assets: [...state.assets, action.payload]
      }
      
    case ActionTypes.UPDATE_ASSET:
      return {
        ...state,
        assets: state.assets.map(asset =>
          asset.id === action.payload.id ? action.payload : asset
        )
      }
      
    case ActionTypes.DELETE_ASSET:
      return {
        ...state,
        assets: state.assets.filter(asset => asset.id !== action.payload)
      }
      
    case ActionTypes.ADD_TAG:
      return {
        ...state,
        tags: [...state.tags, action.payload]
      }
      
    case ActionTypes.UPDATE_TAG:
      return {
        ...state,
        tags: state.tags.map(tag =>
          tag.id === action.payload.id ? action.payload : tag
        )
      }
      
    case ActionTypes.DELETE_TAG:
      return {
        ...state,
        tags: state.tags.filter(tag => tag.id !== action.payload)
      }
      
    default:
      return state
  }
}

// Context
const AppContext = createContext()

// Provider component
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  // Action creators
  const actions = {
    setLoading: (loading) => dispatch({ type: ActionTypes.SET_LOADING, payload: loading }),
    setError: (error) => dispatch({ type: ActionTypes.SET_ERROR, payload: error }),
    clearError: () => dispatch({ type: ActionTypes.CLEAR_ERROR }),
    setCurrency: (currency) => dispatch({ type: ActionTypes.SET_CURRENCY, payload: currency }),

    // Load master data
    loadTransactionTypes: async () => {
      try {
        actions.setLoading(true)
        const types = await adminApi.listTypes()
        dispatch({ type: ActionTypes.SET_TRANSACTION_TYPES, payload: types || [] })
      } catch (error) {
        actions.setError(error.message)
      } finally {
        actions.setLoading(false)
      }
    },

    loadAccounts: async () => {
      try {
        actions.setLoading(true)
        const accounts = await adminApi.listAccounts()
        dispatch({ type: ActionTypes.SET_ACCOUNTS, payload: accounts || [] })
      } catch (error) {
        actions.setError(error.message)
      } finally {
        actions.setLoading(false)
      }
    },

    loadAssets: async () => {
      try {
        actions.setLoading(true)
        const assets = await adminApi.listAssets()
        dispatch({ type: ActionTypes.SET_ASSETS, payload: assets || [] })
      } catch (error) {
        actions.setError(error.message)
      } finally {
        actions.setLoading(false)
      }
    },

    loadTags: async () => {
      try {
        actions.setLoading(true)
        const tags = await adminApi.listTags()
        dispatch({ type: ActionTypes.SET_TAGS, payload: tags || [] })
      } catch (error) {
        actions.setError(error.message)
      } finally {
        actions.setLoading(false)
      }
    },

    loadAllMasterData: async () => {
      try {
        actions.setLoading(true)
        const [types, accounts, assets, tags] = await Promise.all([
          adminApi.listTypes(),
          adminApi.listAccounts(),
          adminApi.listAssets(),
          adminApi.listTags(),
        ])
        
        dispatch({ type: ActionTypes.SET_TRANSACTION_TYPES, payload: types || [] })
        dispatch({ type: ActionTypes.SET_ACCOUNTS, payload: accounts || [] })
        dispatch({ type: ActionTypes.SET_ASSETS, payload: assets || [] })
        dispatch({ type: ActionTypes.SET_TAGS, payload: tags || [] })
      } catch (error) {
        actions.setError(error.message)
      } finally {
        actions.setLoading(false)
      }
    },

    // CRUD operations
    createTransactionType: async (type) => {
      try {
        const newType = await adminApi.createType(type)
        dispatch({ type: ActionTypes.ADD_TRANSACTION_TYPE, payload: newType })
        return newType
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    updateTransactionType: async (id, type) => {
      try {
        const updatedType = await adminApi.updateType(id, type)
        dispatch({ type: ActionTypes.UPDATE_TRANSACTION_TYPE, payload: updatedType })
        return updatedType
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    deleteTransactionType: async (id) => {
      try {
        await adminApi.deleteType(id)
        dispatch({ type: ActionTypes.DELETE_TRANSACTION_TYPE, payload: id })
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    createAccount: async (account) => {
      try {
        const newAccount = await adminApi.createAccount(account)
        dispatch({ type: ActionTypes.ADD_ACCOUNT, payload: newAccount })
        return newAccount
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    updateAccount: async (id, account) => {
      try {
        const updatedAccount = await adminApi.updateAccount(id, account)
        dispatch({ type: ActionTypes.UPDATE_ACCOUNT, payload: updatedAccount })
        return updatedAccount
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    deleteAccount: async (id) => {
      try {
        await adminApi.deleteAccount(id)
        dispatch({ type: ActionTypes.DELETE_ACCOUNT, payload: id })
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    createAsset: async (asset) => {
      try {
        const newAsset = await adminApi.createAsset(asset)
        dispatch({ type: ActionTypes.ADD_ASSET, payload: newAsset })
        return newAsset
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    updateAsset: async (id, asset) => {
      try {
        const updatedAsset = await adminApi.updateAsset(id, asset)
        dispatch({ type: ActionTypes.UPDATE_ASSET, payload: updatedAsset })
        return updatedAsset
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    deleteAsset: async (id) => {
      try {
        await adminApi.deleteAsset(id)
        dispatch({ type: ActionTypes.DELETE_ASSET, payload: id })
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    createTag: async (tag) => {
      try {
        const newTag = await adminApi.createTag(tag)
        dispatch({ type: ActionTypes.ADD_TAG, payload: newTag })
        return newTag
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    updateTag: async (id, tag) => {
      try {
        const updatedTag = await adminApi.updateTag(id, tag)
        dispatch({ type: ActionTypes.UPDATE_TAG, payload: updatedTag })
        return updatedTag
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },

    deleteTag: async (id) => {
      try {
        await adminApi.deleteTag(id)
        dispatch({ type: ActionTypes.DELETE_TAG, payload: id })
      } catch (error) {
        actions.setError(error.message)
        throw error
      }
    },
  }

  // Load master data on mount
  useEffect(() => {
    actions.loadAllMasterData()
  }, [])

  const value = {
    ...state,
    actions,
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

// Hook to use the context
export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

export default AppContext
