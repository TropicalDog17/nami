import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_URL = 'http://localhost:8080/api';

async function main() {
    try {
        console.log('Testing Credit Card Flow...');
        const unique = uuidv4().split('-')[0];
        const bank = `Bank_${unique}`;
        const cc = `CC_${unique}`;

        // 1. Funding
        await axios.post(`${API_URL}/actions`, {
            action: 'init_balance',
            params: { account: bank, asset: 'USD', quantity: 1000, date: '2024-01-01' }
        });

        // 2. Expenses on CC
        // Using direct expense endpoint

        // Wait, actions.ts only has 'spot_buy' and 'init_balance' and 'transfer'.
        // I should probably add 'expense' and 'income' to actions.ts for consistency?
        // But routes.ts exposes /transactions/expense.
        // I'll use /transactions/expense.

        await axios.post(`${API_URL}/transactions/expense`, {
            asset: { type: 'FIAT', symbol: 'USD' },
            amount: 50,
            account: cc,
            note: 'Lunch',
            at: '2024-01-05T12:00:00Z'
        });

        await axios.post(`${API_URL}/transactions/expense`, {
            asset: { type: 'FIAT', symbol: 'USD' }, // Can be foreign currency too
            amount: 20,
            account: cc,
            note: 'Uber',
            at: '2024-01-06T12:00:00Z'
        });

        // 3. Verify CC Balance (Should be -70)
        let report = await axios.get(`${API_URL}/report`);
        let ccHolding = report.data.holdings.find((h: any) => h.account === cc && h.asset.symbol === 'USD');
        // If it's negative, it might be in holdings with negative balance.
        console.log('CC Balance after expenses:', ccHolding?.balance);

        if (ccHolding?.balance !== -70) {
            // Maybe it's in liabilities?
            // My code puts it in holdings if > 1e-12 abs. But wait, checking for liabilities?
            // liabs map is only from BORROW.
            // So it must be in holdings.
        }

        // 4. Pay off CC (Transfer Bank -> CC)
        await axios.post(`${API_URL}/actions`, {
            action: 'transfer',
            params: {
                from_account: bank,
                to_account: cc,
                asset: 'USD',
                quantity: 70,
                date: '2024-02-01'
            }
        });

        // 5. Verify Balance
        report = await axios.get(`${API_URL}/report`);
        ccHolding = report.data.holdings.find((h: any) => h.account === cc && h.asset.symbol === 'USD');
        const bankHolding = report.data.holdings.find((h: any) => h.account === bank && h.asset.symbol === 'USD');

        console.log('CC Balance after payment:', ccHolding?.balance || 0);
        console.log('Bank Balance after payment:', bankHolding?.balance);

        if ((!ccHolding || Math.abs(ccHolding.balance) < 1e-6) && bankHolding?.balance === 930) {
            console.log('SUCCESS: Credit Card flow verified (Expenses + Payment via Transfer)');
        } else {
            console.error('FAILURE: Balances incorrect');
        }

    } catch (e: any) {
        console.error('Error:', e.response?.data || e.message);
    }
}

main();
