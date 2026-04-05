import { prisma } from '@/app/lib/prisma';
import { getStartOfMonthDhaka, getNowDhaka } from '@/app/lib/utils';
import { parseTimeToMinutes } from '@/app/lib/expenses/utils';
import { getSystemSettings } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS, DEFAULT_SETTINGS, RAMADAN_CONFIG } from '@/app/lib/constants';

export async function getUserSummary(userId: string, existingSettingsMap?: Map<string, string>) {
    const startOfCurrentMonthDhaka = getStartOfMonthDhaka();
    const queryStartCurrentMonth = new Date(startOfCurrentMonthDhaka.getTime() - 6 * 60 * 60 * 1000); // Feb 1 00:00 Dhaka -> Jan 31 18:00 UTC

    const startOfPrevMonthDhaka = new Date(startOfCurrentMonthDhaka);
    startOfPrevMonthDhaka.setMonth(startOfPrevMonthDhaka.getMonth() - 1);

    let settingsMap = existingSettingsMap;
    if (!settingsMap) {
        const settingsRecord: Record<string, string> = await getSystemSettings();
        settingsMap = new Map<string, string>(Object.entries(settingsRecord));
    }

    const lunchCutoffStr = settingsMap.get(SETTINGS_KEYS.LUNCH_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.LUNCH_CUTOFF];
    const dinnerCutoffStr = settingsMap.get(SETTINGS_KEYS.DINNER_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.DINNER_CUTOFF];
    const sahriCutoffStr = settingsMap.get(SETTINGS_KEYS.SAHRI_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.SAHRI_CUTOFF];

    const currentRate = parseFloat(settingsMap.get(SETTINGS_KEYS.MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.MEAL_RATE]);
    const prevRate = parseFloat(settingsMap.get(SETTINGS_KEYS.PREV_MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.PREV_MEAL_RATE]);

    const lunchCutoffMins = parseTimeToMinutes(lunchCutoffStr);
    const dinnerCutoffMins = parseTimeToMinutes(dinnerCutoffStr);
    const sahriCutoffMins = parseTimeToMinutes(sahriCutoffStr);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            snapshots: true,
            statusLogs: {
                orderBy: { changedAt: 'asc' }
            }
        } 
    });
    const totalDeposits = user?.balance || 0;

    const snapshotMap = new Map<string, number>();
    user?.snapshots.forEach(s => {
        snapshotMap.set(s.month, s.totalCost);
    });

    const nowDhaka = getNowDhaka();
    const startOfCurrentMonthUTC = queryStartCurrentMonth;
    const todayUTC = new Date(Date.UTC(nowDhaka.getUTCFullYear(), nowDhaka.getUTCMonth(), nowDhaka.getUTCDate()));
    const endOfTodayUTC = new Date(todayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

    const currentMonthCreditData = await prisma.transaction.aggregate({
        where: {
            requesterId: userId,
            createdAt: { gte: queryStartCurrentMonth },
            status: 'APPROVED',
        },
        _sum: { amount: true }
    });
    const currentMonthCredit = currentMonthCreditData._sum.amount || 0;

    const [monthMeals, initialStatusLog] = await Promise.all([
        prisma.mealStatus.findMany({
            where: {
                userId: userId,
                date: { gte: startOfCurrentMonthUTC, lte: endOfTodayUTC }
            }
        }),
        prisma.userStatusLog.findFirst({
            where: { userId, changedAt: { lt: startOfCurrentMonthUTC } },
            orderBy: { changedAt: 'desc' }
        })
    ]);

    const mealMap = new Map(monthMeals.map(m => {
        const dTime = new Date(m.date.getTime() + 6 * 60 * 60 * 1000);
        return [
            `${dTime.getUTCFullYear()}-${String(dTime.getUTCMonth() + 1).padStart(2, '0')}-${String(dTime.getUTCDate()).padStart(2, '0')}`,
            m
        ];
    }));
    const userLogs = user?.statusLogs || [];
    const initialStatus = initialStatusLog?.status || 'Active';

    let snapshotsCost = 0;
    let prevMonthDynamicCost = 0; 
    let currentMonthDynamicCost = 0;
    let currentMonthPassedCount = 0;

    let passedCount = 0;
    let currentStatus = initialStatus;
    let logIdx = 0;

    const daysPassed = nowDhaka.getUTCDate();

    for (let day = 1; day <= daysPassed; day++) {
        const dateUTC = new Date(Date.UTC(nowDhaka.getFullYear(), nowDhaka.getMonth(), day));
        const dateKey = `${dateUTC.getUTCFullYear()}-${String(dateUTC.getUTCMonth() + 1).padStart(2, '0')}-${String(dateUTC.getUTCDate()).padStart(2, '0')}`;
        const dayEnd = new Date(dateUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

        while (logIdx < userLogs.length && userLogs[logIdx].changedAt <= dayEnd) {
            currentStatus = userLogs[logIdx].status;
            logIdx++;
        }

        const record = mealMap.get(dateKey);
        const isToday = day === daysPassed;

        const currentHour = nowDhaka.getUTCHours(); 
        const currentMinute = nowDhaka.getUTCMinutes(); 
        const nowMins = currentHour * 60 + currentMinute;

        const isSahri = RAMADAN_CONFIG ? (dateUTC >= new Date(RAMADAN_CONFIG.START) && dateUTC <= new Date(RAMADAN_CONFIG.END)) : false;

        if (isToday) {
            const tL = user?.defaultLunchStatus ? 1 : 0;
            const tD = user?.defaultDinnerStatus ? 1 : 0;
            const tS = (isSahri && user?.defaultSahriStatus) ? 1 : 0;

            if (currentStatus === 'Active' || record) {
                if (nowMins >= lunchCutoffMins) passedCount += (record ? record.lunch : (currentStatus === 'Active' ? tL : 0));
                if (nowMins >= dinnerCutoffMins) passedCount += (record ? record.dinner : (currentStatus === 'Active' ? tD : 0));
                if (nowMins >= sahriCutoffMins) passedCount += (record ? record.sahri : (currentStatus === 'Active' ? tS : 0));
            }
        } else {
            if (record) {
                passedCount += (record.lunch ?? 0) + (record.dinner ?? 0) + (record.sahri ?? 0);
            } else if (currentStatus === 'Active') {
                const wasCreated = !user?.createdAt || user.createdAt <= dayEnd;
                if (wasCreated) {
                    const defL = user?.defaultLunchStatus ? 1 : 0;
                    const defD = user?.defaultDinnerStatus ? 1 : 0;
                    const defS = (isSahri && user?.defaultSahriStatus) ? 1 : 0;
                    passedCount += defL + defD + defS;
                }
            }
        }
    }

    currentMonthPassedCount = passedCount;

    const gapGroups = await prisma.mealStatus.groupBy({
        by: ['date'],
        where: {
            userId: userId,
            date: { lt: startOfCurrentMonthUTC }
        },
        _sum: { lunch: true, dinner: true, sahri: true }
    });

    for (const g of gapGroups) {
        const dTime = new Date(g.date.getTime() + 6 * 60 * 60 * 1000);
        const key = `${dTime.getUTCFullYear()}-${String(dTime.getUTCMonth() + 1).padStart(2, '0')}`;
        if (!snapshotMap.has(key)) {
            const count = (g._sum.lunch || 0) + (g._sum.dinner || 0) + (g._sum.sahri || 0);
            const cost = count * prevRate;
            prevMonthDynamicCost += cost;
        }
    }

    snapshotsCost = Array.from(snapshotMap.values()).reduce((a, b) => a + b, 0);

    currentMonthDynamicCost = currentMonthPassedCount * currentRate;

    const totalCost = snapshotsCost + prevMonthDynamicCost + currentMonthDynamicCost;
    const trueRemainingBalance = totalDeposits - totalCost;

    const depositsBeforeThisMonth = totalDeposits - currentMonthCredit;
    const prevMonthBalance = depositsBeforeThisMonth - (snapshotsCost + prevMonthDynamicCost);

    return {
        previousMonthBalance: prevMonthBalance,
        currentMonthCredit: currentMonthCredit,
        currentMonthUsed: currentMonthDynamicCost,
        remainingBalance: trueRemainingBalance,
        passedMealCount: currentMonthPassedCount
    };
}
