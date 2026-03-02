import { prisma } from '@/app/lib/prisma';
import { getNowDhaka, formatUserName } from '@/app/lib/utils';
import { isSahriActive } from '@/app/lib/meals/utils';

export async function getDailyMealStats(date?: Date) {
    const baseDate = date ? new Date(date.toLocaleString("en-US", { timeZone: "Asia/Dhaka" })) : getNowDhaka();
    const targetDate = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()));

    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            nickname: true,
            status: true,
            defaultLunchStatus: true,
            defaultDinnerStatus: true,
            defaultSahriStatus: true
        }
    });

    const meals = await prisma.mealStatus.findMany({
        where: {
            date: targetDate
        }
    });

    const stats = {
        lunch: {
            count: 0,
            users: [] as string[]
        },
        dinner: {
            count: 0,
            users: [] as string[]
        },
        sahri: {
            count: 0,
            users: [] as string[]
        }
    };

    const mealMap = new Map(meals.map(m => [m.userId, m]));

    allUsers.forEach(user => {
        const status = mealMap.get(user.id);
        const isActive = user.status === 'Active';

        if (!isActive && !status) return;

        const displayName = formatUserName(user);

        const defaultLunch = user.defaultLunchStatus ? 1 : 0;
        const defaultDinner = user.defaultDinnerStatus ? 1 : 0;

        const isSahri = isSahriActive(targetDate);
        const defaultSahri = (isSahri && user.defaultSahriStatus) ? 1 : 0;

        const lunchCount = status ? status.lunch : defaultLunch;
        const dinnerCount = status ? status.dinner : defaultDinner;
        const sahriCount = status ? status.sahri : defaultSahri;

        if (lunchCount > 0) {
            stats.lunch.count += lunchCount;
            const label = lunchCount > 1 ? `${displayName} (${lunchCount})` : displayName;
            stats.lunch.users.push(label);
        }
        if (dinnerCount > 0) {
            stats.dinner.count += dinnerCount;
            const label = dinnerCount > 1 ? `${displayName} (${dinnerCount})` : displayName;
            stats.dinner.users.push(label);
        }
        if (sahriCount > 0) {
            stats.sahri.count += sahriCount;
            const label = sahriCount > 1 ? `${displayName} (${sahriCount})` : displayName;
            stats.sahri.users.push(label);
        }
    });

    return stats; // Plain JSON serializable object
}
