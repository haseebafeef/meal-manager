import { prisma } from '@/app/lib/prisma';
import { getNowDhaka } from '@/app/lib/utils';
import { SETTINGS_KEYS, DEFAULT_SETTINGS, APP_LAUNCH, APP_LAUNCH_UTC, RAMADAN_CONFIG } from '@/app/lib/constants';
import { getMonthlyMealHistory } from '@/app/services/meals/history';
import { getSystemSettings } from '@/app/lib/settings-actions';

export async function getSystemStats() {
    const totalExpenses = await prisma.expense.aggregate({
        _sum: { amount: true }
    });

    // Total available balance in user accounts
    const totalUserBalances = await prisma.user.aggregate({
        _sum: { balance: true }
    });

    return {
        totalExpenses: totalExpenses._sum?.amount || 0,
        totalBalances: totalUserBalances._sum?.balance || 0,
    };
}

export async function getMonthlySystemSummary(year: number, month: number) {
    // month is 1-indexed (1=Jan)
    const startDhaka = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const startUTC = new Date(startDhaka.getTime() - 6 * 60 * 60 * 1000);

    const endDhaka = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const endUTC = new Date(endDhaka.getTime() - 6 * 60 * 60 * 1000);

    // 1. Current Month Expenses
    const currentMonthExpenses = await prisma.expense.aggregate({
        where: {
            date: {
                gte: startUTC,
                lt: endUTC
            }
        },
        _sum: { amount: true }
    });
    const totalExpensesCurrent = currentMonthExpenses._sum?.amount || 0;

    // 2. Current Month Credit
    const currentMonthCredit = await prisma.transaction.aggregate({
        where: {
            createdAt: {
                gte: startUTC,
                lt: endUTC
            },
            status: 'APPROVED'
        },
        _sum: { amount: true }
    });
    const totalCreditCurrent = currentMonthCredit._sum?.amount || 0;

    // 3. Previous (Rolling) Balance 
    const prevExpenses = await prisma.expense.aggregate({
        where: { date: { lt: startUTC } },
        _sum: { amount: true }
    });
    const prevCredit = await prisma.transaction.aggregate({
        where: {
            createdAt: { lt: startUTC },
            status: 'APPROVED'
        },
        _sum: { amount: true }
    });

    const prevBalance = (prevCredit._sum?.amount || 0) - (prevExpenses._sum?.amount || 0);
    const remainingFund = prevBalance + totalCreditCurrent - totalExpensesCurrent;

    // 4. Monthly Meal Count (Face Value Month)
    const mealHistory = await getMonthlyMealHistory(year, month - 1);

    // Sum only PASSED meals for history/summary purposes
    const totalMeals = mealHistory.reduce((sum, day) => sum + (day.passedLunchCount || 0) + (day.passedDinnerCount || 0) + (day.passedSahriCount || 0), 0);

    return {
        previousMonthBalance: prevBalance,
        currentMonthCredit: totalCreditCurrent,
        currentMonthExpenses: totalExpensesCurrent,
        remainingFund: remainingFund,
        totalMeals: totalMeals
    };
}

export async function getMonthlyHistorySummary(): Promise<{
    monthKey: string;
    label: string;
    year: number;
    monthNum: number;
    totalExpenses: number;
    totalCredit: number;
    totalMeals: number;
    mealRate: number;
    finalized: boolean;
    netFund: number;
}[]> {
    const LAUNCH_YEAR = APP_LAUNCH.year;
    const LAUNCH_MONTH = APP_LAUNCH.month; // 1-indexed

    const nowDhaka = getNowDhaka();
    const currentYear = nowDhaka.getUTCFullYear();
    const currentMonth = nowDhaka.getUTCMonth() + 1; // 1-indexed

    // Build list of all months from launch to now (inclusive)
    const months: { year: number; monthNum: number }[] = [];
    let y = LAUNCH_YEAR;
    let m = LAUNCH_MONTH;
    while (y < currentYear || (y === currentYear && m <= currentMonth)) {
        months.push({ year: y, monthNum: m });
        m++;
        if (m > 12) { m = 1; y++; }
    }

    // Fetch all snapshots once (O(1) lookup by month key)
    const allSnapshots = await prisma.monthlySnapshot.findMany({
        select: { month: true, mealRate: true, totalMeals: true, totalCost: true }
    });
    const snapshotMap = new Map(allSnapshots.map(s => [s.month, s]));

    // Build results in parallel for each month
    const results = await Promise.all(months.map(async ({ year, monthNum }) => {
        const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;
        const label = new Date(year, monthNum - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

        const mealStart = new Date(Date.UTC(year, monthNum - 1, 1));
        const mealEnd = new Date(Date.UTC(year, monthNum, 0));

        const expStart = new Date(mealStart.getTime() - 6 * 60 * 60 * 1000);
        const expEnd = new Date(mealEnd.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);

        const [expAgg, creditAgg, mealAgg] = await Promise.all([
            prisma.expense.aggregate({
                where: { date: { gte: expStart, lte: expEnd } },
                _sum: { amount: true }
            }),
            prisma.transaction.aggregate({
                where: { createdAt: { gte: expStart, lte: expEnd }, status: 'APPROVED' },
                _sum: { amount: true }
            }),
            prisma.mealStatus.aggregate({
                where: { date: { gte: mealStart, lte: mealEnd } },
                _sum: { lunch: true, dinner: true, sahri: true }
            })
        ]);

        const totalExpenses = expAgg._sum.amount ?? 0;
        const totalCredit = creditAgg._sum.amount ?? 0;
        const totalMeals = (mealAgg._sum.lunch ?? 0) + (mealAgg._sum.dinner ?? 0) + (mealAgg._sum.sahri ?? 0);

        const snapshot = snapshotMap.get(monthKey);
        const finalized = !!snapshot;

        let mealRate = 0;
        if (snapshot) {
            mealRate = snapshot.mealRate;
        } else if (totalMeals > 0) {
            mealRate = Math.ceil((totalExpenses / totalMeals) * 100) / 100;
        }

        return {
            monthKey,
            label,
            year,
            monthNum,
            totalExpenses,
            totalCredit,
            totalMeals,
            mealRate,
            finalized,
            netFund: totalCredit - totalExpenses,
        };
    }));

    return results.reverse();
}

export async function getUserMonthlyBreakdowns(): Promise<{
    monthKey: string;
    label: string;
    year: number;
    monthNum: number;
    users: {
        userId: string;
        userName: string;
        totalMeals: number;
        totalCost: number;
        mealRate: number;
        credit: number;
        netDelta: number;
        finalized: boolean;
    }[];
}[]> {
    const LAUNCH_YEAR = APP_LAUNCH.year;
    const LAUNCH_MONTH = APP_LAUNCH.month; 

    const nowDhaka = getNowDhaka();
    const currentYear = nowDhaka.getUTCFullYear();
    const currentMonth = nowDhaka.getUTCMonth() + 1;

    const months: { year: number; monthNum: number }[] = [];
    let y = LAUNCH_YEAR, m = LAUNCH_MONTH;
    while (y < currentYear || (y === currentYear && m <= currentMonth)) {
        months.push({ year: y, monthNum: m });
        m++; if (m > 12) { m = 1; y++; }
    }

    const allUsers = await prisma.user.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });

    const allSnapshots = await prisma.monthlySnapshot.findMany({
        select: { userId: true, month: true, totalMeals: true, totalCost: true, mealRate: true },
    });
    const snapIndex = new Map<string, typeof allSnapshots[0]>();
    allSnapshots.forEach(s => snapIndex.set(`${s.userId}|${s.month}`, s));

    const settingsRecord: Record<string, string> = await getSystemSettings();
    const settingsMap = new Map<string, string>(Object.entries(settingsRecord));
    const currentRate = parseFloat(settingsMap.get(SETTINGS_KEYS.MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.MEAL_RATE]);

    const results = await Promise.all(months.map(async ({ year, monthNum }) => {
        const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;
        const label = new Date(year, monthNum - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

        const mealStart = new Date(Date.UTC(year, monthNum - 1, 1));
        const mealEnd = new Date(Date.UTC(year, monthNum, 0));

        const txStart = new Date(mealStart.getTime() - 6 * 60 * 60 * 1000);
        const txEnd = new Date(mealEnd.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);

        const txRows = await prisma.transaction.groupBy({
            by: ['requesterId'],
            where: {
                createdAt: { gte: txStart, lte: txEnd },
                status: 'APPROVED',
            },
            _sum: { amount: true },
        });
        const creditByUser = new Map<string, number>(txRows.map(r => [r.requesterId!, r._sum.amount ?? 0]));

        const mealRows = await prisma.mealStatus.groupBy({
            by: ['userId'],
            where: { date: { gte: mealStart, lte: mealEnd } },
            _sum: { lunch: true, dinner: true, sahri: true },
        });
        const mealsByUser = new Map<string, number>(
            mealRows.map(r => [r.userId, (r._sum.lunch ?? 0) + (r._sum.dinner ?? 0) + (r._sum.sahri ?? 0)])
        );

        const userRows = allUsers.map(u => {
            const snapKey = `${u.id}|${monthKey}`;
            const snap = snapIndex.get(snapKey);
            const finalized = !!snap;

            const totalMeals = snap ? snap.totalMeals : (mealsByUser.get(u.id) ?? 0);
            const mealRate = snap ? snap.mealRate : currentRate;
            const totalCost = snap ? snap.totalCost : totalMeals * currentRate;
            const credit = creditByUser.get(u.id) ?? 0;
            const netDelta = credit - totalCost;

            return {
                userId: u.id,
                userName: u.name ?? '(unknown)',
                totalMeals,
                totalCost,
                mealRate,
                credit,
                netDelta,
                finalized,
            };
        });

        return { monthKey, label, year, monthNum, users: userRows };
    }));

    return results.reverse();
}

export async function getSelfMonthlyHistory(userId: string): Promise<{
    monthKey: string;
    label: string;
    prevBalance: number;
    totalCredit: number;
    totalMeals: number;
    mealRate: number;
    totalCost: number;
    closingBalance: number;
    finalized: boolean;
}[]> {
    const LAUNCH_YEAR = APP_LAUNCH.year;
    const LAUNCH_MONTH = APP_LAUNCH.month;

    const nowDhaka = getNowDhaka();
    const currentYear = nowDhaka.getUTCFullYear();
    const currentMonth = nowDhaka.getUTCMonth() + 1;

    const months: { year: number; monthNum: number }[] = [];
    let y = LAUNCH_YEAR, m = LAUNCH_MONTH;
    while (y < currentYear || (y === currentYear && m <= currentMonth)) {
        months.push({ year: y, monthNum: m });
        m++; if (m > 12) { m = 1; y++; }
    }

    const [snapshots, allTransactions, allMeals, allStatusLogs, initialStatusLog, userData, settings] = await Promise.all([
        prisma.monthlySnapshot.findMany({
            where: { userId },
            select: { month: true, totalMeals: true, totalCost: true, mealRate: true, prevBalance: true, totalCredit: true, closingBalance: true },
        }),
        prisma.transaction.findMany({
            where: { requesterId: userId, status: 'APPROVED', createdAt: { gte: APP_LAUNCH_UTC } },
            select: { amount: true, createdAt: true }
        }),
        prisma.mealStatus.findMany({
            where: { userId, date: { gte: APP_LAUNCH_UTC } },
            select: { lunch: true, dinner: true, sahri: true, date: true }
        }),
        prisma.userStatusLog.findMany({
            where: { userId, changedAt: { gte: APP_LAUNCH_UTC } },
            orderBy: { changedAt: 'asc' }
        }),
        prisma.userStatusLog.findFirst({
            where: { userId, changedAt: { lt: APP_LAUNCH_UTC } },
            orderBy: { changedAt: 'desc' }
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: { createdAt: true, defaultLunchStatus: true, defaultDinnerStatus: true, defaultSahriStatus: true }
        }),
        getSystemSettings()
    ]);

    const snapMap = new Map(snapshots.map(s => [s.month, s]));
    const settingsRecord: Record<string, string> = settings;
    const currentRate = parseFloat(settingsRecord[SETTINGS_KEYS.MEAL_RATE] || '65');
    const prevRate = parseFloat(settingsRecord[SETTINGS_KEYS.PREV_MEAL_RATE] || '65');

    let runningBalance = 0;

    const rows = months.map(({ year, monthNum }) => {
        const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;
        const label = new Date(year, monthNum - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

        const mealStart = new Date(Date.UTC(year, monthNum - 1, 1));
        const mealEnd = new Date(Date.UTC(year, monthNum, 0));
        const txStart = new Date(mealStart.getTime() - 6 * 60 * 60 * 1000);
        const txEnd = new Date(mealEnd.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);

        const snap = snapMap.get(monthKey);
        const finalized = !!snap;

        let totalCredit = 0;
        let totalMeals = 0;
        let mealRate = 0;
        let totalCost = 0;
        
        // These will be overridden during the running balance pass if not finalized
        let snapPrevBalance: number | null = null;
        let snapClosingBalance: number | null = null;

        if (snap) {
            // IF it is snapshotted, use the explicit database truth!
            // Note: snap might be lacking fields if Typescript isn't 100% updated, but JS will read them if they exist in DB.
            totalMeals = snap.totalMeals;
            mealRate = snap.mealRate;
            totalCost = snap.totalCost;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            totalCredit = (snap as any).totalCredit ?? 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            snapPrevBalance = (snap as any).prevBalance ?? 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            snapClosingBalance = (snap as any).closingBalance ?? 0;
        } else {
            totalCredit = allTransactions
                .filter(tx => tx.createdAt >= txStart && tx.createdAt <= txEnd)
                .reduce((sum, tx) => sum + tx.amount, 0);

            const monthMeals = allMeals.filter(m => m.date >= mealStart && m.date <= mealEnd);
            const mealMap = new Map(monthMeals.map(m => [m.date.toISOString().split('T')[0], m]));

            const isCurrentM = year === currentYear && monthNum === currentMonth;
            const daysToProcess = isCurrentM ? nowDhaka.getUTCDate() : mealEnd.getUTCDate();

            totalMeals = 0;

            const logsBeforeMonth = (allStatusLogs as { changedAt: Date, status: string }[]).filter(l => l.changedAt < mealStart);
            const monthStartStatus = logsBeforeMonth.length > 0 ? logsBeforeMonth[logsBeforeMonth.length - 1].status : (initialStatusLog?.status || 'Active');

            let currentStatus = monthStartStatus;
            const monthLogs = (allStatusLogs as { changedAt: Date, status: string }[]).filter(l => l.changedAt >= mealStart && l.changedAt <= mealEnd);
            let logIdx = 0;

            for (let day = 1; day <= daysToProcess; day++) {
                const dateUTC = new Date(Date.UTC(year, monthNum - 1, day));
                const dateKey = dateUTC.toISOString().split('T')[0];
                const dayEnd = new Date(dateUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

                while (logIdx < monthLogs.length && monthLogs[logIdx].changedAt <= dayEnd) {
                    currentStatus = monthLogs[logIdx].status;
                    logIdx++;
                }

                const record = mealMap.get(dateKey);
                if (record) {
                    totalMeals += (record.lunch ?? 0) + (record.dinner ?? 0) + (record.sahri ?? 0);
                } else if (currentStatus === 'Active') {
                    const wasCreated = !userData?.createdAt || userData.createdAt <= dayEnd;
                    if (wasCreated) {
                        const defL = userData?.defaultLunchStatus ? 1 : 0;
                        const defD = userData?.defaultDinnerStatus ? 1 : 0;
                        const isSahri = RAMADAN_CONFIG ? (dateUTC >= new Date(RAMADAN_CONFIG.START) && dateUTC <= new Date(RAMADAN_CONFIG.END)) : false;
                        const defS = (isSahri && userData?.defaultSahriStatus) ? 1 : 0;
                        totalMeals += defL + defD + defS;
                    }
                }
            }

            mealRate = isCurrentM ? currentRate : prevRate;
            totalCost = parseFloat((totalMeals * mealRate).toFixed(2));
        }

        return { monthKey, label, totalCredit, totalMeals, mealRate, totalCost, finalized, snapPrevBalance, snapClosingBalance };
    });

    const result = rows.map(row => {
        let prevBalance = runningBalance;
        let closingBalance = 0;

        if (row.finalized && row.snapPrevBalance !== null && row.snapClosingBalance !== null) {
            // Adopt the frozen DB truth, overriding any potential drift
            prevBalance = row.snapPrevBalance;
            closingBalance = row.snapClosingBalance;
        } else {
            // Unfinalized (Current or Prev month): Dynamically compute
            closingBalance = parseFloat((prevBalance + row.totalCredit - row.totalCost).toFixed(2));
        }
        
        runningBalance = closingBalance;
        return { ...row, prevBalance, closingBalance };
    });

    return result.reverse();
}
