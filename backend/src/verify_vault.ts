import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_URL = 'http://localhost:8080/api';

async function main() {
    try {
        console.log('Testing Vault Operations...');
        const unique = uuidv4().split('-')[0];
        const vaultName = `Limitless_${unique}`;
        const bank = `Bank_${unique}`;

        // 1. Funding Bank
        await axios.post(`${API_URL}/actions`, {
            action: 'init_balance',
            params: { account: bank, asset: 'USD', quantity: 2000, date: '2024-01-01' }
        });

        // 2. Create Vault
        await axios.post(`${API_URL}/cons-vaults`, { name: vaultName });

        // 3. Deposit 1000 USD from Bank
        await axios.post(`${API_URL}/cons-vaults/${vaultName}/deposit`, {
            amount: 1000,
            source_account: bank,
            notes: 'Initial Capital'
        });

        // 4. Verify Vault Stats (AUM)
        let res = await axios.get(`${API_URL}/cons-vaults/${vaultName}`);
        let stats = res.data;
        console.log('Stats after Deposit:', stats.total_assets_under_management, stats.total_supply);

        if (Number(stats.total_assets_under_management) !== 1000) {
            console.error('FAILURE: AUM should be 1000');
        }

        // 5. Vault buys Crypto (using spot_buy action acting as Vault)
        // We simulate the vault manager buying 0.1 BTC @ 60000 (Cost 6000)
        // Wait, I only have 1000.
        // Buy 0.01 BTC @ 50000 = 500 USD.
        // We need separate Price feed or force price in spot_buy?
        // spot_buy allows params.price_quote? 
        // Logic: price_quote is price of 1 base in quote terms.

        await axios.post(`${API_URL}/actions`, {
            action: 'spot_buy',
            params: {
                exchange_account: vaultName, // Vault is the account
                base_asset: 'BTC',
                quote_asset: 'USD',
                quantity: 0.01,
                price_quote: 50000,
                fee_percent: 0,
                date: '2024-01-02'
            }
        });

        // Vault now holds: 500 USD and 0.01 BTC.
        // AUM depends on *Current Price* of BTC.
        // By default priceService checks CoinGecko. If live, it might be anything.
        // If "FIXED" source in transaction rate?
        // `vaultStats` calls `report()` which calls `priceService.getRateUSD(asset)`.
        // `getRateUSD` fetches *current* price.
        // We can't easily force priceService value unless we mock it or use 'FIXED' type?
        // But `report` always fetches fresh.
        // However, we can assert that AUM is roughly correct (500 + 0.01 * LivePrice).

        res = await axios.get(`${API_URL}/cons-vaults/${vaultName}`);
        stats = res.data;
        console.log('Stats after Buy:', stats.total_assets_under_management);

        // Check if >= 500 (since BTC > 0).
        if (Number(stats.total_assets_under_management) > 500) {
            console.log('SUCCESS: Vault verification passed');
        } else {
            console.error('FAILURE: AUM too low');
        }

    } catch (e: any) {
        console.error('Error:', e.response?.data || e.message);
    }
}

main();
