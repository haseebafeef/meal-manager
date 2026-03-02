import { prisma } from '@/app/lib/prisma';
import { endOfDay } from 'date-fns';
import { getNowDhaka, formatUserName } from '@/app/lib/utils';
import { getSystemSettings } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { isSahriActive } from '@/app/lib/meals/utils';

export async function getMonthlyMealHistory(year: number, month: number) {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));

    const userIdsInMeals = (await prisma.mealStatus.findMany({
        where: {
            date: {
                gte: start,
                lte: end
            }
        },
        select: {
            userId: true
        },
        distinct: ['userId']
    })).map(m => m.userId);

    const allUsers = await prisma.user.findMany({
        where: {
            OR: [
                { status: 'Active' },
                { id: { in: userIdsInMeals } }
            ]
        },
        select: {
            id: true,
            name: true,
            nickname: true,
            status: true,
            statusLogs: {
                orderBy: { changedAt: 'asc' }
            },
            createdAt: true,
            defaultLunchStatus: true,
            defaultDinnerStatus: true,
            defaultSahriStatus: true
        }
    });

    const meals = await prisma.mealStatus.findMany({
        where: {
            date: {
                gte: start,
                lte: end
            }
        }
    });

    const mealMap = new Map();
    meals.forEach(m => {
        const dateKey = m.date.toISOString().split('T')[0];
        mealMap.set(`${dateKey}_${m.userId}`, m);
    });

    const settingsRecord: Record<string, string> = await getSystemSettings();
    const settingsMap = new Map<string, string>(Object.entries(settingsRecord));
    
    const lunchCutoffStr = settingsMap.get(SETTINGS_KEYS.LUNCH_CUTOFF) || '11:00';
    const dinnerCutoffStr = settingsMap.get(SETTINGS_KEYS.DINNER_CUTOFF) || '13:00';

    const [lH, lM] = lunchCutoffStr.split(':').map(Number);
    const [dH, dM] = dinnerCutoffStr.split(':').map(Number);
    const lunchCutoffMins = lH * 60 + lM;
    const dinnerCutoffMins = dH * 60 + dM;

    const nowDhaka = getNowDhaka();
    const history = [];
    const current = new Date(start);

    const isDayPast = (d: Date) => {
        const todayUTC = new Date(Date.UTC(nowDhaka.getUTCFullYear(), nowDhaka.getUTCMonth(), nowDhaka.getUTCDate()));
        if (d.getTime() < todayUTC.getTime()) return 'PAST';
        if (d.getTime() > todayUTC.getTime()) return 'FUTURE';
        return 'TODAY';
    };

    const currentMins = nowDhaka.getUTCHours() * 60 + nowDhaka.getUTCMinutes();

    const firstMeals = await prisma.mealStatus.groupBy({
        by: ['userId'],
        _min: { date: true },
        where: {
            OR: [
                { lunch: { gt: 0 } },
                { dinner: { gt: 0 } }
            ]
        }
    });

    const snapshots = await prisma.monthlySnapshot.groupBy({
        by: ['userId'],
        _min: { month: true }
    });

    const activationMap = new Map<string, Date>();

    firstMeals.forEach(fm => {
        if (fm._min.date) {
            activationMap.set(fm.userId, fm._min.date);
        }
    });

    snapshots.forEach(sn => {
        if (sn._min.month) {
            const [y, m] = sn._min.month.split('-').map(Number);
            const snapDate = new Date(Date.UTC(y, m - 1, 1));
            const existing = activationMap.get(sn.userId);
            if (!existing || snapDate < existing) {
                activationMap.set(sn.userId, snapDate);
            }
        }
    });

    while (current <= end) {
        const dateKey = current.toISOString().split('T')[0];
        let lunchCount = 0;
        let dinnerCount = 0;
        let sahriCount = 0;
        let passedLunchCount = 0;
        let passedDinnerCount = 0;
        let passedSahriCount = 0;
        let dailyTotalUsers = 0;
        const lunchUsers: string[] = [];
        const dinnerUsers: string[] = [];
        const sahriUsers: string[] = [];

        const dayState = isDayPast(current);
        const dayEnd = endOfDay(current);

        allUsers.forEach(user => {
            const key = `${dateKey}_${user.id}`;
            const status = mealMap.get(key);

            const nextDay = new Date(current);
            nextDay.setUTCDate(current.getUTCDate() + 1);
            if (user.createdAt >= nextDay && !status) return;

            const activationDate = activationMap.get(user.id);
            if (!activationDate) {
                if (!status) return;
            } else {
                if (current.getTime() < activationDate.getTime()) {
                    if (!status) return;
                }
            }

            let computedStatus = 'Active';

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const activeLogs = user.statusLogs ? user.statusLogs.filter((log: any) => log.changedAt <= dayEnd) : [];
            if (activeLogs.length > 0) {
                computedStatus = activeLogs[activeLogs.length - 1].status;
            }

            if ((computedStatus === 'Inactive' || computedStatus === 'Deleted') && !status) {
                return;
            }

            dailyTotalUsers++;
            const displayName = formatUserName(user);

            const isSahri = isSahriActive(current);
            const defaultLunch = user.defaultLunchStatus ? 1 : 0;
            const defaultDinner = user.defaultDinnerStatus ? 1 : 0;
            const defaultSahri = (isSahri && user.defaultSahriStatus) ? 1 : 0;

            const lVal = status ? status.lunch : defaultLunch;
            const dVal = status ? status.dinner : defaultDinner;
            const sVal = status ? status.sahri : defaultSahri;

            if (lVal > 0) {
                lunchCount += lVal;
                let isPassed = false;
                if (dayState === 'PAST') isPassed = true;
                else if (dayState === 'TODAY' && currentMins >= lunchCutoffMins) isPassed = true;

                if (isPassed) passedLunchCount += lVal;

                const label = lVal > 1 ? `${displayName} (${lVal})` : displayName;
                lunchUsers.push(label);
            }
            if (dVal > 0) {
                dinnerCount += dVal;
                let isPassed = false;
                if (dayState === 'PAST') isPassed = true;
                else if (dayState === 'TODAY' && currentMins >= dinnerCutoffMins) isPassed = true;

                if (isPassed) passedDinnerCount += dVal;

                const label = dVal > 1 ? `${displayName} (${dVal})` : displayName;
                dinnerUsers.push(label);
            }
            if (sVal > 0) {
                sahriCount += sVal;
                const sahriCutoffMins = 3 * 60;

                let isPassed = false;
                if (dayState === 'PAST') isPassed = true;
                else if (dayState === 'TODAY' && currentMins >= sahriCutoffMins) isPassed = true;

                if (isPassed) passedSahriCount += sVal;

                const label = sVal > 1 ? `${displayName} (${sVal})` : displayName;
                sahriUsers.push(label);
            }
        });

        history.push({
            date: new Date(current),
            lunchCount,
            dinnerCount,
            sahriCount, 
            passedLunchCount,
            passedDinnerCount,
            passedSahriCount, 
            totalUsers: dailyTotalUsers,
            lunchUsers,
            dinnerUsers,
            sahriUsers 
        });

        current.setUTCDate(current.getUTCDate() + 1);
    }

    return history;
}
