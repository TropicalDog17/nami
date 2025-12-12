import axios from 'axios';

const API_URL = 'http://localhost:8080/api';

async function main() {
    try {
        console.log('Testing Transfer...');
        // 1. Initial funding (to have balance)
        await axios.post(`${API_URL}/actions`, {
            action: 'init_balance',
            params: {
                account: 'Bank',
                asset: 'USD',
                quantity: 1000,
                date: '2024-01-01'
            }
        });
        console.log('Funded Bank with 1000 USD');

        // 2. Perform Transfer
        const res = await axios.post(`${API_URL}/actions`, {
            action: 'transfer',
            params: {
                from_account: 'Bank',
                to_account: 'Wallet',
                asset: 'USD',
                quantity: 100,
                fee: 1,
                date: '2024-01-02'
            }
        });
        console.log('Transfer Response:', res.status, res.data.ok ? 'OK' : 'FAIL');

        // 3. Check Report
        const report = await axios.get(`${API_URL}/report`);
        const holdings = report.data.holdings;

        const bank = holdings.find((h: any) => h.account === 'Bank' && h.asset.symbol === 'USD');
        const wallet = holdings.find((h: any) => h.account === 'Wallet' && h.asset.symbol === 'USD');

        console.log('Bank Balance:', bank?.balance); // Should be 1000 - 100 - 1 = 899
        console.log('Wallet Balance:', wallet?.balance); // Should be 100

        if (bank?.balance === 899 && wallet?.balance === 100) {
            console.log('SUCCESS: Transfer verified');
        } else {
            console.error('FAILURE: Balances incorrect');
        }

    } catch (e: any) {
        console.error('Error:', e.response?.data || e.message);
    }
}

main();
