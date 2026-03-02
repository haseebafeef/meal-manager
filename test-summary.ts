import { getBatchUserSummaries } from './app/services/expenses/summary';

async function main() {
    console.log("Testing getBatchUserSummaries...");
    try {
        const results = await getBatchUserSummaries();
        console.log("Success! Results snippet:");
        Array.from(results.entries()).slice(0, 3).forEach(([userId, data]) => {
            console.log(userId, data);
        });
    } catch (e) {
        console.error("Error running query:", e);
    }
}

main();
