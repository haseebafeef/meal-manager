
import { prisma } from '@/app/lib/prisma';
import { subDays } from 'date-fns';
import { RAMADAN_CONFIG } from '@/app/lib/constants';

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

    // 2. Fetch All active users only? No, default might be needed for inactive too if we track history.
    // But usually active checks apply. Let's stick to locking for *all* to be safe or just active?
    // Current logic fetches ALL.
    const users = await prisma.user.findMany({
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

    return { success: true, date: yesterdayKey, created: createdCount };
}
