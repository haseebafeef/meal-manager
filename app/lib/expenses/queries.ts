'use server';

import { prisma } from '@/app/lib/prisma';
import { getStartOfMonthDhaka, getNowDhaka } from '@/app/lib/utils';
import { SETTINGS_KEYS, DEFAULT_SETTINGS, RAMADAN_CONFIG, APP_LAUNCH, APP_LAUNCH_UTC } from '@/app/lib/constants';
import { parseTimeToMinutes, formatMonthKey } from './utils';
import { getMonthlyMealHistory } from '@/app/lib/meals';
import { getSystemSettings } from '@/app/lib/settings-actions';

export async function getExpenses() {
    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

    return await prisma.expense.findMany({
        where: {
            date: { gte: twentyDaysAgo }
        },
        orderBy: { date: 'desc' },
        take: 10,
        include: { purchaser: { select: { name: true } } }
    });
}

export async function getSystemStats() {
    const totalExpenses = await prisma.expense.aggregate({
        _sum: { amount: true }
    });

    // Total available balance in user accounts
    const totalUserBalances = await prisma.user.aggregate({
        _sum: { balance: true }
    });

    return {
        totalExpenses: totalExpenses._sum.amount || 0,
        totalBalances: totalUserBalances._sum.balance || 0,
    };
}

export async function getSystemSummary() {
    // 1. Current Month Expenses
    // Calculate the start of the current month in UTC, adjusted for the local offset (UTC+6)
    // to ensure accurate monthly data retrieval relative to local business hours.
    const dhakaStart = getStartOfMonthDhaka();
    const queryStart = new Date(dhakaStart.getTime() - 6 * 60 * 60 * 1000);


    // Parallelize Aggregations
    const [currentMonthExpenses, currentMonthCreditData, prevExpenses, prevCredit] = await prisma.$transaction([
        prisma.expense.aggregate({
            where: {
                date: { gte: queryStart }
            },
            _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
            where: {
                createdAt: { gte: queryStart },
                status: 'APPROVED'
            },
            _sum: { amount: true }
        }),
        // Bound to APP_LAUNCH_UTC to exclude stale or future-dated records outside the app lifetime
        prisma.expense.aggregate({
            where: { date: { gte: APP_LAUNCH_UTC, lt: queryStart } },
            _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
            where: {
                createdAt: { gte: APP_LAUNCH_UTC, lt: queryStart },
                status: 'APPROVED'
            },
            _sum: { amount: true }
        })
    ]);

    const totalExpensesCurrent = currentMonthExpenses._sum.amount || 0;
    const totalCreditCurrent = currentMonthCreditData._sum.amount || 0;
    const prevBalance = (prevCredit._sum.amount || 0) - (prevExpenses._sum.amount || 0);

    const remainingFund = prevBalance + totalCreditCurrent - totalExpensesCurrent;

    return {
        previousMonthBalance: prevBalance,
        currentMonthCredit: totalCreditCurrent,
        currentMonthExpenses: totalExpensesCurrent,
        remainingFund: remainingFund
    };
}

export async function getUserSummary(userId: string, existingSettingsMap?: Map<string, string>) {
    const startOfCurrentMonthDhaka = getStartOfMonthDhaka();
    const queryStartCurrentMonth = new Date(startOfCurrentMonthDhaka.getTime() - 6 * 60 * 60 * 1000); // Feb 1 00:00 Dhaka -> Jan 31 18:00 UTC

    // Calculate Start of Previous Month
    // (Month index wrap is handled by JavaScript's setMonth)
    const startOfPrevMonthDhaka = new Date(startOfCurrentMonthDhaka);
    startOfPrevMonthDhaka.setMonth(startOfPrevMonthDhaka.getMonth() - 1);
    // const queryStartPrevMonth = new Date(startOfPrevMonthDhaka.getTime() - 6 * 60 * 60 * 1000);

    // 1. Fetch Settings (Use passed map or fetch cached)
    let settingsMap = existingSettingsMap;
    if (!settingsMap) {
        const settingsRecord = await getSystemSettings();
        settingsMap = new Map(Object.entries(settingsRecord));
    }

    const lunchCutoffStr = settingsMap.get(SETTINGS_KEYS.LUNCH_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.LUNCH_CUTOFF];
    const dinnerCutoffStr = settingsMap.get(SETTINGS_KEYS.DINNER_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.DINNER_CUTOFF];
    const sahriCutoffStr = settingsMap.get(SETTINGS_KEYS.SAHRI_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.SAHRI_CUTOFF];

    const currentRate = parseFloat(settingsMap.get(SETTINGS_KEYS.MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.MEAL_RATE]);
    // Sahri Rate is same as Meal Rate for now
    const prevRate = parseFloat(settingsMap.get(SETTINGS_KEYS.PREV_MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.PREV_MEAL_RATE]);

    const lunchCutoffMins = parseTimeToMinutes(lunchCutoffStr);
    const dinnerCutoffMins = parseTimeToMinutes(dinnerCutoffStr);
    const sahriCutoffMins = parseTimeToMinutes(sahriCutoffStr);

    // 2. Fetch User Data
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            snapshots: true,
            statusLogs: {
                orderBy: { changedAt: 'asc' }
            }
        } // Fetch Snapshots & Logs
    });
    const totalDeposits = user?.balance || 0;

    // Map snapshots for easy lookup: "YYYY-MM" -> Cost
    const snapshotMap = new Map<string, number>();
    user?.snapshots.forEach(s => {
        snapshotMap.set(s.month, s.totalCost);
    });

    // 3. Current Month Credit
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

    // 4. Status & Meal Data for Current Month
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

    const mealMap = new Map(monthMeals.map(m => [m.date.toISOString().split('T')[0], m]));
    const userLogs = user?.statusLogs || [];
    const initialStatus = initialStatusLog?.status || 'Active';

    let snapshotsCost = 0;
    let prevMonthDynamicCost = 0; // Legacy / Fallback
    let currentMonthDynamicCost = 0;
    let currentMonthPassedCount = 0;

    // 4. Optimized Meal Calculation (Prisma Aggregation)
    // We use the database to sum up known records, and project defaults for missing days.

    // NOTE: The active cost is computed from passedMealCount below (after today's meals are evaluated).

    // 5. Calculate Passed Count (Status-Aware Projection)
    let passedCount = 0;
    let currentStatus = initialStatus;
    let logIdx = 0;

    const daysPassed = nowDhaka.getUTCDate();

    for (let day = 1; day <= daysPassed; day++) {
        const dateUTC = new Date(Date.UTC(nowDhaka.getFullYear(), nowDhaka.getMonth(), day));
        const dateKey = dateUTC.toISOString().split('T')[0];
        const dayEnd = new Date(dateUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

        // Update status for this day
        while (logIdx < userLogs.length && userLogs[logIdx].changedAt <= dayEnd) {
            currentStatus = userLogs[logIdx].status;
            logIdx++;
        }

        const record = mealMap.get(dateKey);
        const isToday = day === daysPassed;

        // getNowDhaka() constructs a Date using Date.UTC(y, m, d, h, min, s) where y/m/d/h/min/s are
        // the Dhaka local time components. So the Dhaka local hour is stored in the UTC fields.
        // Therefore getUTCHours() correctly returns the Dhaka local hour here.
        const currentHour = nowDhaka.getUTCHours(); // = Dhaka local hour (intentional)
        const currentMinute = nowDhaka.getUTCMinutes(); // = Dhaka local minute (intentional)
        const nowMins = currentHour * 60 + currentMinute;

        const isSahri = RAMADAN_CONFIG ? (dateUTC >= new Date(RAMADAN_CONFIG.START) && dateUTC <= new Date(RAMADAN_CONFIG.END)) : false;

        if (isToday) {
            // Today logic: Only count if past cutoff
            const tL = user?.defaultLunchStatus ? 1 : 0;
            const tD = user?.defaultDinnerStatus ? 1 : 0;
            const tS = (isSahri && user?.defaultSahriStatus) ? 1 : 0;

            if (currentStatus === 'Active' || record) {
                if (nowMins >= lunchCutoffMins) passedCount += (record ? record.lunch : (currentStatus === 'Active' ? tL : 0));
                if (nowMins >= dinnerCutoffMins) passedCount += (record ? record.dinner : (currentStatus === 'Active' ? tD : 0));
                if (nowMins >= sahriCutoffMins) passedCount += (record ? record.sahri : (currentStatus === 'Active' ? tS : 0));
            }
        } else {
            // Past day logic
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

    // Calculate Past Dynamic (Prev Month not in Snapshot)
    const gapGroups = await prisma.mealStatus.groupBy({
        by: ['date'],
        where: {
            userId: userId,
            date: { lt: startOfCurrentMonthUTC }
        },
        _sum: { lunch: true, dinner: true, sahri: true }
    });

    for (const g of gapGroups) {
        const key = formatMonthKey(g.date);
        if (!snapshotMap.has(key)) {
            const count = (g._sum.lunch || 0) + (g._sum.dinner || 0) + (g._sum.sahri || 0);
            const cost = count * prevRate;
            prevMonthDynamicCost += cost;
        }
    }

    // Sum all Snapshots (Existing + Newly Created)
    snapshotsCost = Array.from(snapshotMap.values()).reduce((a, b) => a + b, 0);

    // Calculate Current Cost
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

export async function getBatchUserSummaries() {
    // 1. Setup Time Boundaries
    const nowDhaka = getNowDhaka();
    const currentMonthStartDhaka = getStartOfMonthDhaka();
    const currentMonthStartUTC = new Date(currentMonthStartDhaka.getTime() - 6 * 60 * 60 * 1000); // Shift for DB query

    // Define "Today Midnight" in UTC (Lock point for Passed vs Future)
    const todayMidnightDhaka = new Date(Date.UTC(nowDhaka.getFullYear(), nowDhaka.getMonth(), nowDhaka.getDate()));
    const endOfTodayUTC = todayMidnightDhaka;

    // Previous Month Boundaries
    const prevMonthStartDhaka = new Date(currentMonthStartDhaka);
    prevMonthStartDhaka.setMonth(prevMonthStartDhaka.getMonth() - 1);
    const prevMonthStartUTC = new Date(prevMonthStartDhaka.getTime() - 6 * 60 * 60 * 1000);
    const prevMonthEndDhaka = new Date(currentMonthStartDhaka);
    prevMonthEndDhaka.setDate(0); // Last day of prev month
    const prevMonthEndUTC = new Date(prevMonthEndDhaka.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);


    const settings = await getSystemSettings();

    // 2. Fetch ALL required data in Parallel
    const [
        users,
        allSnapshots,
        currentMonthStatusLogs,
        initialStatusLogs,
        prevMonthAggregates,
        pastMonthAggregates, // Strictly Past (< Today)
        todayAggregates      // Today Only
    ] = await prisma.$transaction([
        prisma.user.findMany({
            select: { id: true, balance: true, status: true, defaultLunchStatus: true, defaultDinnerStatus: true, defaultSahriStatus: true, createdAt: true }
        }),
        prisma.monthlySnapshot.findMany({
            select: { userId: true, month: true, totalCost: true }
        }),
        prisma.userStatusLog.findMany({
            where: { changedAt: { gte: currentMonthStartUTC } },
            orderBy: { changedAt: 'asc' }
        }),
        prisma.userStatusLog.findMany({
            where: { changedAt: { lt: currentMonthStartUTC } },
            orderBy: { changedAt: 'desc' },
            distinct: ['userId']
        }),
        // Previous Month Sums (Grouped by User)
        prisma.mealStatus.groupBy({
            by: ['userId'],
            where: { date: { gte: prevMonthStartUTC, lte: prevMonthEndUTC } },
            orderBy: { userId: 'asc' },
            _sum: { lunch: true, dinner: true, sahri: true },
            _count: { _all: true }
        }),
        // Current Month PAST Sums (Grouped by User) - Strictly BEFORE Today
        prisma.mealStatus.groupBy({
            by: ['userId'],
            where: {
                date: {
                    gte: currentMonthStartUTC,
                    lt: new Date(todayMidnightDhaka.getTime() - 6 * 60 * 60 * 1000) // < Today Start (DB time)
                }
            },
            orderBy: { userId: 'asc' },
            _sum: { lunch: true, dinner: true, sahri: true },
            _count: { _all: true }
        }),
        // Today's Aggregate (To check existence and sum values)
        prisma.mealStatus.groupBy({
            by: ['userId'],
            where: {
                date: {
                    gte: new Date(todayMidnightDhaka.getTime() - 6 * 60 * 60 * 1000), // Today Start
                    lte: endOfTodayUTC
                }
            },
            orderBy: { userId: 'asc' },
            _sum: { lunch: true, dinner: true, sahri: true },
            _count: { _all: true }
        })
    ]);

    // 3. Process Settings
    const settingsMap = settings; // settings is already the cached record object
    const currentRate = parseFloat(settingsMap[SETTINGS_KEYS.MEAL_RATE]);
    const prevRate = parseFloat(settingsMap[SETTINGS_KEYS.PREV_MEAL_RATE]);

    const lunchCutoffStr = settingsMap[SETTINGS_KEYS.LUNCH_CUTOFF];
    const dinnerCutoffStr = settingsMap[SETTINGS_KEYS.DINNER_CUTOFF];
    const sahriCutoffStr = settingsMap[SETTINGS_KEYS.SAHRI_CUTOFF];

    const lunchCutoffMins = parseTimeToMinutes(lunchCutoffStr);
    const dinnerCutoffMins = parseTimeToMinutes(dinnerCutoffStr);
    const sahriCutoffMins = parseTimeToMinutes(sahriCutoffStr);

    const currentHour = nowDhaka.getUTCHours();
    const currentMinute = nowDhaka.getUTCMinutes();
    const nowMins = currentHour * 60 + currentMinute;

    const isSahriToday = RAMADAN_CONFIG ? (todayMidnightDhaka >= new Date(RAMADAN_CONFIG.START) && todayMidnightDhaka <= new Date(RAMADAN_CONFIG.END)) : false;

    // 4. Index Data for O(1) Access
    const userClosedMonths = new Map<string, Set<string>>();
    const userFixedCost = new Map<string, number>();

    allSnapshots.forEach((s) => {
        if (!userClosedMonths.has(s.userId)) userClosedMonths.set(s.userId, new Set());
        userClosedMonths.get(s.userId)?.add(s.month); // "YYYY-MM"

        const currentTotal = userFixedCost.get(s.userId) || 0;
        userFixedCost.set(s.userId, currentTotal + s.totalCost);
    });

    const prevAggMap = new Map();
    prevMonthAggregates.forEach((a) => prevAggMap.set(a.userId, a));

    const pastAggMap = new Map();
    pastMonthAggregates.forEach((a) => pastAggMap.set(a.userId, a));

    const todayAggMap = new Map();
    todayAggregates.forEach((a) => todayAggMap.set(a.userId, a));

    // Status Logs indexing
    const statusLogsByUser = new Map<string, typeof currentMonthStatusLogs>();
    currentMonthStatusLogs.forEach((log) => {
        if (!statusLogsByUser.has(log.userId)) statusLogsByUser.set(log.userId, []);
        statusLogsByUser.get(log.userId)?.push(log);
    });

    const initialStatusMap = new Map<string, string>();
    initialStatusLogs.forEach((log) => initialStatusMap.set(log.userId, log.status));

    // 5. Calculate per User
    const results = new Map();

    const prevMonthKey = formatMonthKey(prevMonthStartUTC);

    // Current Month Days - PASSED only
    const daysPassedInCurrentMonth = nowDhaka.getUTCDate(); // 1-31

    for (const user of users) {
        // A. Fixed History
        let totalCost = userFixedCost.get(user.id) || 0;
        const closedMonths = userClosedMonths.get(user.id) || new Set();

        // B. Previous Month Dynamic (If not closed)
        if (!closedMonths.has(prevMonthKey)) {
            const agg = prevAggMap.get(user.id);
            // Only count actual DB records, do not project defaults for past months to match Individual Dashboard behavior
            const dbSum = agg ? ((agg._sum.lunch || 0) + (agg._sum.dinner || 0) + (agg._sum.sahri || 0)) : 0;
            totalCost += dbSum * prevRate;
        }

        // C. Current Month Dynamic (Passed Days Only)
        // Only calculate if NOT already finalized (Snapshot exists)
        const currentMonthKey = formatMonthKey(currentMonthStartUTC);

        if (!closedMonths.has(currentMonthKey)) {
            // Part 1: History (Strictly Past)
            const pastAgg = pastAggMap.get(user.id);
            const pastDbCount = pastAgg ? pastAgg._count._all : 0;
            const pastDbSum = pastAgg ? ((pastAgg._sum.lunch || 0) + (pastAgg._sum.dinner || 0) + (pastAgg._sum.sahri || 0)) : 0;

            const userLogs = statusLogsByUser.get(user.id) || [];
            let logIdx = 0;
            const defTotal = (user.defaultLunchStatus ? 1 : 0) + (user.defaultDinnerStatus ? 1 : 0) + (user.defaultSahriStatus ? 1 : 0);

            // Calculate status for each PAST day
            for (let day = 1; day < daysPassedInCurrentMonth; day++) {
                const dateUTC = new Date(Date.UTC(nowDhaka.getFullYear(), nowDhaka.getMonth(), day));
                const dayEnd = new Date(dateUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

                // Update status up to the end of this day
                while (logIdx < userLogs.length && userLogs[logIdx].changedAt <= dayEnd) {
                    logIdx++;
                }
            }

            // Simplified but status-aware active days count:
            let activeDaysCount = 0;
            let dayStatus = initialStatusMap.get(user.id) || 'Active';
            let innerLogIdx = 0;

            for (let d = 1; d < daysPassedInCurrentMonth; d++) {
                const dEnd = new Date(Date.UTC(nowDhaka.getFullYear(), nowDhaka.getMonth(), d, 23, 59, 59, 999));
                while (innerLogIdx < userLogs.length && userLogs[innerLogIdx].changedAt <= dEnd) {
                    dayStatus = userLogs[innerLogIdx].status;
                    innerLogIdx++;
                }

                // Also check if user was created before/on this day
                let wasCreated = true;
                if (user.createdAt && user.createdAt > dEnd) {
                    wasCreated = false;
                }

                if (dayStatus === 'Active' && wasCreated) {
                    activeDaysCount++;
                }
            }

            const missingDays = Math.max(0, activeDaysCount - pastDbCount);
            const pastProj = missingDays * defTotal;

            // Part 2: Today (Conditional)
            const todayAgg = todayAggMap.get(user.id);
            let todayCostItems = 0;

            // Determine status for "Today" so far
            let todayStatus = dayStatus;
            while (innerLogIdx < userLogs.length && userLogs[innerLogIdx].changedAt <= nowDhaka) {
                todayStatus = userLogs[innerLogIdx].status;
                innerLogIdx++;
            }

            if (todayStatus === 'Active') {
                const tL = todayAgg ? todayAgg._sum.lunch : (user.defaultLunchStatus ? 1 : 0);
                const tD = todayAgg ? todayAgg._sum.dinner : (user.defaultDinnerStatus ? 1 : 0);
                const tS = todayAgg ? todayAgg._sum.sahri : (isSahriToday && user.defaultSahriStatus ? 1 : 0);

                if (nowMins >= lunchCutoffMins) todayCostItems += tL;
                if (nowMins >= dinnerCutoffMins) todayCostItems += tD;
                if (nowMins >= sahriCutoffMins) todayCostItems += tS;
            } else if (todayAgg) {
                // If inactive TODAY but HAS an explicit record, still count it if past cutoff
                const tL = todayAgg._sum.lunch || 0;
                const tD = todayAgg._sum.dinner || 0;
                const tS = todayAgg._sum.sahri || 0;

                if (nowMins >= lunchCutoffMins) todayCostItems += tL;
                if (nowMins >= dinnerCutoffMins) todayCostItems += tD;
                if (nowMins >= sahriCutoffMins) todayCostItems += tS;
            }

            totalCost += (pastDbSum + pastProj + todayCostItems) * currentRate;
        }

        // Result
        results.set(user.id, {
            remainingBalance: (user.balance || 0) - totalCost
        });
    }

    return results;
}

export async function getDetailedExpenses() {
    const expenses = await prisma.expense.findMany({
        orderBy: { date: 'desc' },
        include: {
            purchaser: {
                select: { name: true, nickname: true }
            }
        }
    });

    return expenses.map(e => ({
        id: e.id,
        date: e.date,
        description: e.description,
        volume: e.volume || '-',
        unit: e.unit || 0,
        unitPrice: e.unitPrice || 0,
        amount: e.amount,
        purchaser: e.purchaser.nickname || e.purchaser.name,
        memo: e.description
    }));
}

export async function getMonthlyExpenses(year: number, month: number) {
    const startDhaka = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const startUTC = new Date(startDhaka.getTime() - 6 * 60 * 60 * 1000);

    const endDhaka = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
    const endUTC = new Date(endDhaka.getTime() - 6 * 60 * 60 * 1000);

    const expenses = await prisma.expense.findMany({
        where: {
            date: {
                gte: startUTC,
                lte: endUTC
            }
        },
        orderBy: { date: 'desc' },
        include: {
            purchaser: {
                select: { name: true, nickname: true }
            }
        }
    });

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
        expenses: expenses.map(e => ({
            id: e.id,
            date: e.date,
            description: e.description,
            amount: e.amount,
            volume: e.volume,
            unit: e.unit,
            unitPrice: e.unitPrice,
            imagePath: e.imagePath,
            purchaserName: e.purchaser.nickname || e.purchaser.name,
        })),
        total
    };
}

export async function getAvailableExpenseMonths() {
    const allExpenses = await prisma.expense.findMany({
        select: { date: true },
        orderBy: { date: 'desc' }
    });

    const months = new Set<string>();
    allExpenses.forEach(e => {
        const d = new Date(e.date.getTime() + 6 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 7); // YYYY-MM
        months.add(key);
    });

    return Array.from(months);
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
    const totalExpensesCurrent = currentMonthExpenses._sum.amount || 0;

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
    const totalCreditCurrent = currentMonthCredit._sum.amount || 0;

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

    const prevBalance = (prevCredit._sum.amount || 0) - (prevExpenses._sum.amount || 0);

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

/**
 * Returns a month-by-month system-wide summary from the app launch month up to today.
 * Each row contains:
 *   - monthKey (YYYY-MM), label (e.g. "February 2026")
 *   - totalExpenses  — sum of all Expense.amount
 *   - totalCredit    — sum of all approved Transaction deposits
 *   - totalMeals     — total meals consumed across all users
 *   - mealRate       — from MonthlySnapshot if finalized, else computed (ceil to 2dp)
 *   - finalized      — true if a MonthlySnapshot row exists for this month
 *   - netFund        — totalCredit - totalExpenses
 * Results are newest-first.
 */
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
        const label = new Date(year, monthNum - 1, 1)
            .toLocaleString('default', { month: 'long', year: 'numeric' });

        // Meal records use UTC-midnight face-value dates
        const mealStart = new Date(Date.UTC(year, monthNum - 1, 1));
        const mealEnd = new Date(Date.UTC(year, monthNum, 0));        // last day of month, midnight UTC

        // Expenses are stored with Dhaka-face-value = UTC - 6h
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
        const totalMeals =
            (mealAgg._sum.lunch ?? 0) +
            (mealAgg._sum.dinner ?? 0) +
            (mealAgg._sum.sahri ?? 0);

        const snapshot = snapshotMap.get(monthKey);
        const finalized = !!snapshot;

        // Rate: use finalized snapshot's stored rate, else compute from actuals (always ceil up)
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

    // Newest month first
    return results.reverse();
}

/**
 * Per-user monthly breakdown — for the history page individual summary.
 *
 * For each month since app launch, returns one row per user with:
 *   - totalMeals  : meals consumed that month
 *   - totalCost   : cost charged (from snapshot if finalized, else meals × currentRate)
 *   - mealRate    : the rate used
 *   - credit      : approved deposits that month
 *   - netDelta    : credit - totalCost (positive = user topped up more than cost)
 *   - finalized   : whether a MonthlySnapshot exists
 *
 * Result shape: months[] (newest first), each with users[].
 */
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
    const LAUNCH_MONTH = APP_LAUNCH.month; // 1-indexed

    const nowDhaka = getNowDhaka();
    const currentYear = nowDhaka.getUTCFullYear();
    const currentMonth = nowDhaka.getUTCMonth() + 1;

    // All months from launch to today
    const months: { year: number; monthNum: number }[] = [];
    let y = LAUNCH_YEAR, m = LAUNCH_MONTH;
    while (y < currentYear || (y === currentYear && m <= currentMonth)) {
        months.push({ year: y, monthNum: m });
        m++; if (m > 12) { m = 1; y++; }
    }

    // Fetch all users once
    const allUsers = await prisma.user.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });

    // Fetch all snapshots once (indexed by userId+monthKey)
    const allSnapshots = await prisma.monthlySnapshot.findMany({
        select: { userId: true, month: true, totalMeals: true, totalCost: true, mealRate: true },
    });
    const snapIndex = new Map<string, typeof allSnapshots[0]>();
    allSnapshots.forEach(s => snapIndex.set(`${s.userId}|${s.month}`, s));

    // Fetch system settings for current rate (used for non-finalized months)
    const settings = await prisma.systemSettings.findMany();
    const settingsMap = new Map(settings.map(s => [s.key, s.value]));
    const currentRate = parseFloat(settingsMap.get(SETTINGS_KEYS.MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.MEAL_RATE]);

    // Build result month-by-month
    const results = await Promise.all(months.map(async ({ year, monthNum }) => {
        const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;
        const label = new Date(year, monthNum - 1, 1)
            .toLocaleString('default', { month: 'long', year: 'numeric' });

        // Meal boundaries (UTC midnight face-value)
        const mealStart = new Date(Date.UTC(year, monthNum - 1, 1));
        const mealEnd = new Date(Date.UTC(year, monthNum, 0));

        // Transaction boundaries: Dhaka = UTC - 6h
        const txStart = new Date(mealStart.getTime() - 6 * 60 * 60 * 1000);
        const txEnd = new Date(mealEnd.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);

        // Fetch credit deposits for ALL users this month in one query
        const txRows = await prisma.transaction.groupBy({
            by: ['requesterId'],
            where: {
                createdAt: { gte: txStart, lte: txEnd },
                status: 'APPROVED',
            },
            _sum: { amount: true },
        });
        const creditByUser = new Map<string, number>(
            txRows.map(r => [r.requesterId!, r._sum.amount ?? 0])
        );

        // Fetch meal aggregates for ALL users this month in one query (for open months)
        const mealRows = await prisma.mealStatus.groupBy({
            by: ['userId'],
            where: { date: { gte: mealStart, lte: mealEnd } },
            _sum: { lunch: true, dinner: true, sahri: true },
        });
        const mealsByUser = new Map<string, number>(
            mealRows.map(r => [
                r.userId,
                (r._sum.lunch ?? 0) + (r._sum.dinner ?? 0) + (r._sum.sahri ?? 0),
            ])
        );

        // Build per-user rows
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

    return results.reverse(); // newest first
}

/**
 * Single-user month-by-month history with running balance carry-forward.
 * Columns: prevBalance | totalCredit | totalMeals | mealRate | totalCost
 * Newest month first.
 */
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

    // 1. Bulk fetch all relevant data
    const [snapshots, allTransactions, allMeals, allStatusLogs, initialStatusLog, userData, settings] = await Promise.all([
        prisma.monthlySnapshot.findMany({
            where: { userId },
            select: { month: true, totalMeals: true, totalCost: true, mealRate: true },
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
    const settingsMap = settings;
    const currentRate = parseFloat(settingsMap[SETTINGS_KEYS.MEAL_RATE]);
    const prevRate = parseFloat(settingsMap[SETTINGS_KEYS.PREV_MEAL_RATE]);

    let runningBalance = 0;

    // 2. Process months newest to oldest requires computing running balance oldest to newest first
    const rows = months.map(({ year, monthNum }) => {
        const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;
        const label = new Date(year, monthNum - 1, 1)
            .toLocaleString('default', { month: 'long', year: 'numeric' });

        const mealStart = new Date(Date.UTC(year, monthNum - 1, 1));
        const mealEnd = new Date(Date.UTC(year, monthNum, 0));
        const txStart = new Date(mealStart.getTime() - 6 * 60 * 60 * 1000);
        const txEnd = new Date(mealEnd.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);

        // Filter transactions for this month
        const totalCredit = allTransactions
            .filter(tx => tx.createdAt >= txStart && tx.createdAt <= txEnd)
            .reduce((sum, tx) => sum + tx.amount, 0);

        const snap = snapMap.get(monthKey);
        const finalized = !!snap;

        let totalMeals: number;
        let mealRate: number;
        let totalCost: number;

        if (snap) {
            totalMeals = snap.totalMeals;
            mealRate = snap.mealRate;
            totalCost = snap.totalCost;
        } else {
            // Filter meals for this month
            const monthMeals = allMeals.filter(m => {
                const d = m.date;
                return d >= mealStart && d <= mealEnd;
            });
            const mealMap = new Map(monthMeals.map(m => [m.date.toISOString().split('T')[0], m]));

            const isCurrentM = year === currentYear && monthNum === currentMonth;
            const daysToProcess = isCurrentM ? nowDhaka.getUTCDate() : mealEnd.getUTCDate();

            totalMeals = 0;

            // Determine status at start of month
            const logsBeforeMonth = (allStatusLogs as { changedAt: Date, status: string }[]).filter(l => l.changedAt < mealStart);
            const monthStartStatus = logsBeforeMonth.length > 0
                ? logsBeforeMonth[logsBeforeMonth.length - 1].status
                : (initialStatusLog?.status || 'Active');

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
                    // Check if user was already created
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

        return { monthKey, label, totalCredit, totalMeals, mealRate, totalCost, finalized };
    });

    // 3. Compute running balance oldest → newest
    const result = rows.map(row => {
        const prevBalance = runningBalance;
        const closingBalance = parseFloat((prevBalance + row.totalCredit - row.totalCost).toFixed(2));
        runningBalance = closingBalance;
        return { ...row, prevBalance, closingBalance };
    });

    return result.reverse();
}
