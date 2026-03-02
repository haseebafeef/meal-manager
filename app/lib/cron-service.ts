
import { prisma } from '@/app/lib/prisma';
import { subDays } from 'date-fns';
import { RAMADAN_CONFIG } from '@/app/lib/constants';
import { autoComputePrevMonthRate } from '@/app/actions/expenses';

export async function lockYesterdayMeals() {
    // 1. Define "Yesterday" in Dhaka Time
    // We want to lock the day that just fully passed.
    // If this runs at 00:05 AM (today), we lock (today - 1 day).
    const dhakaTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
    const dhakaToday = new Date(dhakaTimeStr);
    const yesterday = subDays(dhakaToday, 1);

    // Format YYYY-MM-DD (Local) -> then convert to UTC Midnight for DB
    const yY = yesterday.getFullYear();
    const yM = yesterday.getMonth();
    const yD = yesterday.getDate();

    const yesterdayKey = new Date(Date.UTC(yY, yM, yD)); // Midnight UTC

    // Only lock Active users — Inactive/Deleted users should not have meal records materialized.
    // If they are later reactivated, their history from the inactive period should remain blank.
    const users = await prisma.user.findMany({
        where: { status: 'Active' },
        select: { id: true, defaultLunchStatus: true, defaultDinnerStatus: true, defaultSahriStatus: true }
    });

    // 3. Bulk Fetch Existing Records
    const existingRecords = await prisma.mealStatus.findMany({
        where: {
            date: yesterdayKey
        },
        select: { userId: true }
    });

    const existingUserIds = new Set(existingRecords.map(r => r.userId));

    // 4. Prepare Missing Records
    // Helper for Sahri Check
    const start = new Date(RAMADAN_CONFIG.START);
    const end = new Date(RAMADAN_CONFIG.END);
    const isSahri = yesterdayKey >= start && yesterdayKey <= end;

    const dataToCreate = [];

    for (const user of users) {
        if (!existingUserIds.has(user.id)) {
            const defaultSahri = (isSahri && user.defaultSahriStatus) ? 1 : 0;
            dataToCreate.push({
                userId: user.id,
                date: yesterdayKey,
                lunch: user.defaultLunchStatus ? 1 : 0,
                dinner: user.defaultDinnerStatus ? 1 : 0,
                sahri: defaultSahri
            });
        }
    }

    if (dataToCreate.length > 0) {
        await prisma.mealStatus.createMany({
            data: dataToCreate
        });
    }

    const createdCount = dataToCreate.length;

    // 5. Month-End Check: if yesterday was the last day of its month
    //    (i.e., today is the 1st), auto-compute PREV_MEAL_RATE from actual data.
    //    This runs once per month automatically, right after all yesterday's meals are locked.
    const lastDayOfYesterdayMonth = new Date(Date.UTC(yY, yM + 1, 0)).getUTCDate(); // last day number
    const isMonthEnd = yD === lastDayOfYesterdayMonth;

    let rateResult = null;
    if (isMonthEnd) {
        try {
            rateResult = await autoComputePrevMonthRate(yY, yM + 1);
            console.log(`[Cron] Month-end auto-rate for ${yY}-${String(yM + 1).padStart(2, '0')}:`, rateResult);
        } catch (e) {
            console.error('[Cron] Auto-rate computation failed:', e);
        }
    }

    return {
        success: true,
        date: yesterdayKey,
        created: createdCount,
        autoRate: rateResult
    };
}
