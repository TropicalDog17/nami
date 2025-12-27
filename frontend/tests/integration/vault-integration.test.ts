import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import axios, { AxiosInstance } from 'axios';

/**
 * Frontend-Backend Integration Tests for Vault Operations
 * 
 * These tests verify that:
 * 1. Frontend can correctly communicate with backend vault APIs
 * 2. Data is correctly serialized/deserialized
 * 3. State management works correctly with backend responses
 * 4. Error handling is appropriate
 * 5. Transactions are processed correctly end-to-end
 */

interface VaultResponse {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  token_symbol: string;
  token_decimals: number;
  total_supply: string;
  total_assets_under_management: string;
  current_share_price: string;
  is_deposit_allowed: boolean;
  is_withdrawal_allowed: boolean;
  inception_date: string;
  created_by: string;
}

interface VaultShareResponse {
  id: string;
  vault_id: string;
  user_id: string;
  share_balance: string;
  net_deposits: string;
  fees_paid: string;
  first_deposit_date: string;
  last_activity_date: string;
}

interface VaultTransactionResponse {
  id: string;
  vault_id: string;
  user_id?: string;
  type: string;
  status: string;
  amount_usd: string;
  shares: string;
  price_per_share: string;
  asset?: string;
  account?: string;
  asset_quantity?: string;
  asset_price?: string;
  fee_amount?: string;
  fee_type?: string;
  fee_rate?: string;
  timestamp: string;
  created_by: string;
}

describe('Vault Integration Tests - Frontend to Backend', () => {
  let client: AxiosInstance;
  const baseURL = process.env.BACKEND_URL || 'http://localhost:8080';
  let testVaultId: string;
  let testUserId = 'test-user-integration-001';

  beforeAll(() => {
    client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  afterAll(() => {
    // Cleanup if needed
  });

  beforeEach(() => {
    // Reset test data before each test
  });

  describe('Vault CRUD Operations', () => {
    it('should create a vault', async () => {
      const vaultData = {
        name: 'Integration Test Vault',
        description: 'A vault for integration testing',
        type: 'single_asset',
        status: 'active',
        token_symbol: 'INT-TEST',
        token_decimals: 18,
        initial_share_price: '1.0',
        min_deposit_amount: '1',
        is_deposit_allowed: true,
        is_withdrawal_allowed: true,
        created_by: 'test-integration',
      };

      const response = await client.post<VaultResponse>('/api/vaults', vaultData);

      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();
      expect(response.data.id).toBeDefined();
      expect(response.data.name).toBe(vaultData.name);
      expect(response.data.type).toBe(vaultData.type);
      expect(response.data.status).toBe('active');

      testVaultId = response.data.id;
    });

    it('should retrieve a vault by ID', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const response = await client.get<VaultResponse>(`/api/vaults/${testVaultId}`);

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.id).toBe(testVaultId);
      expect(response.data.name).toBe('Integration Test Vault');
    });

    it('should list all vaults', async () => {
      const response = await client.get<VaultResponse[]>('/api/vaults');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);
    });

    it('should update a vault', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const updateData = {
        description: 'Updated description for integration testing',
        status: 'active',
      };

      const response = await client.patch<VaultResponse>(
        `/api/vaults/${testVaultId}`,
        updateData
      );

      expect(response.status).toBe(200);
      expect(response.data.description).toBe(updateData.description);
    });
  });

  describe('Vault Share Operations', () => {
    it('should create a vault share', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const shareData = {
        vault_id: testVaultId,
        user_id: testUserId,
        share_balance: '0',
        avg_cost_per_share: '1.0',
      };

      const response = await client.post<VaultShareResponse>(
        '/api/vault-shares',
        shareData
      );

      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();
      expect(response.data.vault_id).toBe(testVaultId);
      expect(response.data.user_id).toBe(testUserId);
    });

    it('should retrieve user vault shares', async () => {
      const response = await client.get<VaultShareResponse[]>(
        `/api/users/${testUserId}/vault-shares`
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should retrieve vault shares for a specific vault', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const response = await client.get<VaultShareResponse[]>(
        `/api/vaults/${testVaultId}/shares`
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('Vault Transaction Operations', () => {
    it('should create a deposit transaction', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const transactionData = {
        vault_id: testVaultId,
        user_id: testUserId,
        type: 'deposit',
        status: 'executed',
        amount_usd: '10000',
        shares: '10000',
        price_per_share: '1.0',
        asset: 'BTC',
        account: 'Binance Spot',
        asset_quantity: '0.5',
        asset_price: '20000',
        created_by: 'test-integration',
      };

      const response = await client.post<VaultTransactionResponse>(
        '/api/vault-transactions',
        transactionData
      );

      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();
      expect(response.data.type).toBe('deposit');
      expect(response.data.amount_usd).toBe('10000');
      expect(response.data.vault_id).toBe(testVaultId);
    });

    it('should retrieve vault transactions', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const response = await client.get<VaultTransactionResponse[]>(
        `/api/vaults/${testVaultId}/transactions`
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);
    });

    it('should retrieve user transactions', async () => {
      const response = await client.get<VaultTransactionResponse[]>(
        `/api/users/${testUserId}/transactions`
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should create a yield transaction', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const transactionData = {
        vault_id: testVaultId,
        type: 'yield',
        status: 'executed',
        amount_usd: '100.50',
        asset: 'BTC',
        account: 'Binance Spot',
        asset_quantity: '0.005',
        asset_price: '20000',
        created_by: 'test-integration',
      };

      const response = await client.post<VaultTransactionResponse>(
        '/api/vault-transactions',
        transactionData
      );

      expect(response.status).toBe(201);
      expect(response.data.type).toBe('yield');
      expect(response.data.amount_usd).toBe('100.50');
    });

    it('should create a fee transaction', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const transactionData = {
        vault_id: testVaultId,
        type: 'fee',
        status: 'executed',
        fee_amount: '50.25',
        fee_type: 'management',
        fee_rate: '0.005',
        created_by: 'test-integration',
      };

      const response = await client.post<VaultTransactionResponse>(
        '/api/vault-transactions',
        transactionData
      );

      expect(response.status).toBe(201);
      expect(response.data.type).toBe('fee');
      expect(response.data.fee_amount).toBe('50.25');
    });
  });

  describe('Vault Summary and Reporting', () => {
    it('should retrieve vault summary', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const response = await client.get(
        `/api/vaults/${testVaultId}/summary`
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.vault_id).toBe(testVaultId);
      expect(response.data.total_shares_outstanding).toBeDefined();
      expect(response.data.total_aum).toBeDefined();
    });

    it('should retrieve user vault summary', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const response = await client.get(
        `/api/vaults/${testVaultId}/users/${testUserId}/summary`
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.vault_id).toBe(testVaultId);
      expect(response.data.user_id).toBe(testUserId);
    });

    it('should retrieve transaction summary', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const response = await client.get(
        `/api/vaults/${testVaultId}/transactions/summary`
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.total_transactions).toBeDefined();
      expect(response.data.total_deposits).toBeDefined();
      expect(response.data.total_withdrawals).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent vault', async () => {
      try {
        await client.get('/api/vaults/non-existent-vault-id');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response?.status).toBe(404);
      }
    });

    it('should return 400 for invalid vault data', async () => {
      try {
        await client.post('/api/vaults', {
          // Missing required fields
          name: 'Invalid Vault',
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response?.status).toBe(400);
      }
    });

    it('should return 400 for invalid transaction data', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      try {
        await client.post('/api/vault-transactions', {
          vault_id: testVaultId,
          // Missing required fields
          type: 'deposit',
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response?.status).toBe(400);
      }
    });
  });

  describe('Data Consistency', () => {
    it('should maintain consistency between deposit and share creation', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const userId = 'test-user-consistency-001';
      const depositAmount = '5000';

      // Create deposit
      const depositResponse = await client.post<VaultTransactionResponse>(
        '/api/vault-transactions',
        {
          vault_id: testVaultId,
          user_id: userId,
          type: 'deposit',
          status: 'executed',
          amount_usd: depositAmount,
          shares: depositAmount,
          price_per_share: '1.0',
          asset: 'BTC',
          account: 'Binance Spot',
          asset_quantity: '0.25',
          asset_price: '20000',
          created_by: 'test-integration',
        }
      );

      expect(depositResponse.status).toBe(201);

      // Verify user shares were created/updated
      const sharesResponse = await client.get<VaultShareResponse[]>(
        `/api/users/${userId}/vault-shares`
      );

      expect(sharesResponse.status).toBe(200);
      expect(sharesResponse.data.length).toBeGreaterThan(0);

      const userShare = sharesResponse.data.find(
        (s) => s.vault_id === testVaultId && s.user_id === userId
      );
      expect(userShare).toBeDefined();
    });

    it('should correctly calculate vault AUM from transactions', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      // Get vault before transactions
      const vaultBefore = await client.get<VaultResponse>(
        `/api/vaults/${testVaultId}`
      );

      // Create multiple transactions
      const transactions = [
        {
          vault_id: testVaultId,
          user_id: 'test-user-aum-001',
          type: 'deposit',
          status: 'executed',
          amount_usd: '1000',
          shares: '1000',
          price_per_share: '1.0',
          asset: 'BTC',
          account: 'Binance Spot',
          asset_quantity: '0.05',
          asset_price: '20000',
          created_by: 'test-integration',
        },
        {
          vault_id: testVaultId,
          user_id: 'test-user-aum-002',
          type: 'deposit',
          status: 'executed',
          amount_usd: '2000',
          shares: '2000',
          price_per_share: '1.0',
          asset: 'BTC',
          account: 'Binance Spot',
          asset_quantity: '0.1',
          asset_price: '20000',
          created_by: 'test-integration',
        },
      ];

      for (const tx of transactions) {
        await client.post('/api/vault-transactions', tx);
      }

      // Get vault after transactions
      const vaultAfter = await client.get<VaultResponse>(
        `/api/vaults/${testVaultId}`
      );

      // AUM should have increased
      const aumBefore = parseFloat(vaultBefore.data.total_assets_under_management || '0');
      const aumAfter = parseFloat(vaultAfter.data.total_assets_under_management || '0');

      expect(aumAfter).toBeGreaterThan(aumBefore);
    });
  });

  describe('Transaction Immutability', () => {
    it('should not allow updating a transaction', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      // Create a transaction
      const createResponse = await client.post<VaultTransactionResponse>(
        '/api/vault-transactions',
        {
          vault_id: testVaultId,
          user_id: testUserId,
          type: 'deposit',
          status: 'executed',
          amount_usd: '1000',
          shares: '1000',
          price_per_share: '1.0',
          asset: 'BTC',
          account: 'Binance Spot',
          asset_quantity: '0.05',
          asset_price: '20000',
          created_by: 'test-integration',
        }
      );

      const txId = createResponse.data.id;

      // Try to update the transaction
      try {
        await client.patch(`/api/vault-transactions/${txId}`, {
          amount_usd: '2000',
        });
        expect.fail('Should not allow updating transaction');
      } catch (error: any) {
        // Expected to fail
        expect(error.response?.status).toBe(405); // Method Not Allowed or 409 Conflict
      }
    });

    it('should not allow deleting a transaction', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      // Create a transaction
      const createResponse = await client.post<VaultTransactionResponse>(
        '/api/vault-transactions',
        {
          vault_id: testVaultId,
          user_id: testUserId,
          type: 'deposit',
          status: 'executed',
          amount_usd: '1000',
          shares: '1000',
          price_per_share: '1.0',
          asset: 'BTC',
          account: 'Binance Spot',
          asset_quantity: '0.05',
          asset_price: '20000',
          created_by: 'test-integration',
        }
      );

      const txId = createResponse.data.id;

      // Try to delete the transaction
      try {
        await client.delete(`/api/vault-transactions/${txId}`);
        expect.fail('Should not allow deleting transaction');
      } catch (error: any) {
        // Expected to fail
        expect(error.response?.status).toBe(405); // Method Not Allowed or 409 Conflict
      }
    });
  });

  describe('Decimal Precision', () => {
    it('should preserve decimal precision in amounts', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const preciseAmount = '1234.56789';
      const response = await client.post<VaultTransactionResponse>(
        '/api/vault-transactions',
        {
          vault_id: testVaultId,
          user_id: testUserId,
          type: 'yield',
          status: 'executed',
          amount_usd: preciseAmount,
          asset: 'BTC',
          account: 'Binance Spot',
          asset_quantity: '0.06189',
          asset_price: '19999.99',
          created_by: 'test-integration',
        }
      );

      expect(response.data.amount_usd).toBe(preciseAmount);
    });

    it('should preserve decimal precision in prices', async () => {
      if (!testVaultId) {
        throw new Error('testVaultId not set');
      }

      const precisePrice = '19999.99999999';
      const response = await client.post<VaultTransactionResponse>(
        '/api/vault-transactions',
        {
          vault_id: testVaultId,
          type: 'valuation',
          status: 'executed',
          asset: 'BTC',
          account: 'Binance Spot',
          asset_quantity: '1.0',
          asset_price: precisePrice,
          created_by: 'test-integration',
        }
      );

      expect(response.data.asset_price).toBe(precisePrice);
    });
  });
});





