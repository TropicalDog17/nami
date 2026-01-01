import { priceService } from "../src/services/price.service";

interface TestResult {
    asset: string;
    days: number;
    success: number;
    failed: number;
    rates: Array<{ date: string; rate: number; source: string }>;
    errors: string[];
}

async function testHistoricalPrices(
    type: "CRYPTO" | "FIAT",
    symbol: string,
    days: number
): Promise<TestResult> {
    console.log(`\n📊 Testing ${symbol} (${type}) for ${days} days of historical data...`);

    const result: TestResult = {
        asset: `${type}:${symbol}`,
        days,
        success: 0,
        failed: 0,
        rates: [],
        errors: [],
    };

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Test specific dates spread across the period
    const testDates: Date[] = [];
    const currentDate = new Date(startDate);

    // Test every 3 days to get good coverage without too many requests
    while (currentDate <= endDate) {
        testDates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 3);
    }

    console.log(`   Testing ${testDates.length} dates...`);

    for (const date of testDates) {
        try {
            const rate = await priceService.getRateUSD(
                { type, symbol },
                date.toISOString()
            );

            result.success++;
            result.rates.push({
                date: date.toISOString().split("T")[0],
                rate: rate.rateUSD,
                source: rate.source,
            });

            console.log(
                `   ✅ ${date.toISOString().split("T")[0]}: $${rate.rateUSD.toFixed(2)} (${rate.source})`
            );
        } catch (error: any) {
            result.failed++;
            const errorMsg = error?.message || "Unknown error";
            result.errors.push(`${date.toISOString()}: ${errorMsg}`);
            console.log(
                `   ❌ ${date.toISOString().split("T")[0]}: ${errorMsg}`
            );
        }

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return result;
}

function printSummary(results: TestResult[]) {
    console.log("\n" + "=".repeat(80));
    console.log("📈 HISTORICAL PRICE TEST SUMMARY");
    console.log("=".repeat(80));

    let totalSuccess = 0;
    let totalFailed = 0;

    for (const result of results) {
        console.log(`\n${result.asset}:`);
        console.log(`   Days Tested: ${result.days}`);
        console.log(`   ✅ Success: ${result.success}`);
        console.log(`   ❌ Failed: ${result.failed}`);
        console.log(`   Success Rate: ${((result.success / (result.success + result.failed)) * 100).toFixed(1)}%`);

        if (result.errors.length > 0) {
            console.log(`   Errors:`);
            result.errors.slice(0, 3).forEach((err) => console.log(`     - ${err}`));
            if (result.errors.length > 3) {
                console.log(`     ... and ${result.errors.length - 3} more errors`);
            }
        }

        totalSuccess += result.success;
        totalFailed += result.failed;
    }

    console.log("\n" + "=".repeat(80));
    console.log(`TOTAL: ${totalSuccess} successful, ${totalFailed} failed`);
    console.log(`Overall Success Rate: ${((totalSuccess / (totalSuccess + totalFailed)) * 100).toFixed(1)}%`);
    console.log("=".repeat(80));

    if (totalFailed > 0) {
        console.log("\n⚠️  Some tests failed. Check errors above.");
        process.exit(1);
    } else {
        console.log("\n✅ All tests passed!");
        process.exit(0);
    }
}

async function main() {
    console.log("🧪 Starting Historical Price Service Tests");
    console.log("Testing BTC, ETH, and XAU over 30 days\n");

    const results: TestResult[] = [];

    // Test BTC
    const btcResult = await testHistoricalPrices("CRYPTO", "BTC", 30);
    results.push(btcResult);

    // Test ETH
    const ethResult = await testHistoricalPrices("CRYPTO", "ETH", 30);
    results.push(ethResult);

    // Test XAU (Gold)
    const xauResult = await testHistoricalPrices("FIAT", "XAU", 30);
    results.push(xauResult);

    printSummary(results);
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
