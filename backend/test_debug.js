const express = require('express');
const request = require('supertest');
const { vi } = require('vitest');

// Mock setup similar to test
let mockTransactions = [];
let mockVaults = [];
let mockEntries = [];

vi.doMock = vi.doMock || ((m, f) => {
  const mod = f();
  require.cache[require.resolve(m)] = { exports: mod };
  return mod;
});

vi.resetModules = vi.resetModules || (() => {});

vi.resetModules();

vi.doMock('./src/repositories', () => ({
  transactionRepository: {
    findAll: () => mockTransactions,
    findById: (id) => mockTransactions.find(t => t.id === id),
    create: (tx) => { mockTransactions.push(tx); return tx; },
    delete: (id) => { const idx = mockTransactions.findIndex(t => t.id === id); if (idx === -1) return false; mockTransactions.splice(idx, 1); return true; },
  },
  vaultRepository: {
    findByName: (name) => mockVaults.find(v => v.name === name),
    findAll: () => mockVaults,
    create: (vault) => { mockVaults.push(vault); return vault; },
    findAllEntries: (vaultName) => mockEntries.filter(e => e.vault === vaultName),
    createEntry: (entry) => { mockEntries.push(entry); return entry; },
  },
  settingsRepository: {
    getDefaultSpendingVaultName: () => 'Spend',
    getDefaultIncomeVaultName: () => 'Income',
    getBorrowingSettings: () => ({ borrowingVaultName: 'Borrowing' }),
    get: (key) => { if (key === 'defaultSpendingVaultName') return 'Spend'; if (key === 'defaultIncomeVaultName') return 'Income'; return undefined; },
    set: vi.fn(),
  },
}));

vi.doMock('./src/services/price.service', () => ({
  priceService: {
    getRateUSD: async (asset) => {
      const symbol = asset.symbol.toUpperCase();
      let rateUSD = 1;
      if (symbol === 'BTC') rateUSD = 50000;
      else if (symbol === 'ETH') rateUSD = 3000;
      else if (symbol === 'VND') rateUSD = 1 / 24000;
      return { asset, rateUSD, timestamp: new Date().toISOString(), source: 'MOCK' };
    },
  },
}));

async function createApp() {
  const { transactionsRouter } = await import('./src/handlers/transaction.handler');
  const app = express();
  app.use(express.json());
  app.use('/api', transactionsRouter);
  return app;
}

(async () => {
  const app = await createApp();
  const res = await request(app)
    .post('/api/transactions/expense')
    .send({
      asset: { type: 'FIAT', symbol: 'USD' },
      amount: 50,
      note: 'Groceries',
      category: 'food',
    });
  
  console.log('Status:', res.status);
  console.log('Body:', JSON.stringify(res.body, null, 2));
  console.log('mockTransactions:', mockTransactions.length);
})();
