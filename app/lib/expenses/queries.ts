'use server';

import { prisma } from '@/app/lib/prisma';
import { getStartOfMonthDhaka, getNowDhaka } from '@/app/lib/utils';
import { SETTINGS_KEYS, DEFAULT_SETTINGS, RAMADAN_CONFIG } from '@/app/lib/constants';
import { parseTimeToMinutes, formatMonthKey } from './utils';
import { getMonthlyMealHistory } from '@/app/lib/meals';

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
        prisma.expense.aggregate({
            where: { date: { lt: queryStart } },
            _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
            where: {
                createdAt: { lt: queryStart },
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

    // 1. Fetch Settings (Use passed map or fetch new)
    let settingsMap = existingSettingsMap;
    if (!settingsMap) {
        const settings = await prisma.systemSettings.findMany();
        settingsMap = new Map(settings.map(s => [s.key, s.value]));
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
    const currentMonthCreditData = await prisma.transaction.aggregate({
        where: {
            requesterId: userId,
            createdAt: { gte: queryStartCurrentMonth },
            status: 'APPROVED',
        },
        _sum: { amount: true }
    });
    const currentMonthCredit = currentMonthCreditData._sum.amount || 0;

    // Gap Detection (Variables needed for logic below)
    // const gapMealsMap = new Map<string, { count: number, year: number, monthNum: number }>();
    let snapshotsCost = 0;
    let prevMonthDynamicCost = 0; // Legacy / Fallback
    let currentMonthDynamicCost = 0;
    let currentMonthPassedCount = 0;

    // 4. Optimized Meal Calculation (Prisma Aggregation)
    // We use the database to sum up known records, and project defaults for missing days.

    // A. Current Month Range
    const startOfCurrentMonthUTC = new Date(startOfCurrentMonthDhaka.getTime() - 6 * 60 * 60 * 1000); // 18:00 Prev Day
    // End of Current Month
    const endOfCurrentMonthDhaka = new Date(startOfCurrentMonthDhaka);
    endOfCurrentMonthDhaka.setMonth(endOfCurrentMonthDhaka.getMonth() + 1);
    endOfCurrentMonthDhaka.setDate(0); // Last day
    const endOfCurrentMonthUTC = new Date(endOfCurrentMonthDhaka.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1); // End of last day

    // B. Aggregation
    const currentMonthStats = await prisma.mealStatus.aggregate({
        where: {
            userId: userId,
            date: {
                gte: startOfCurrentMonthUTC,
                lte: endOfCurrentMonthUTC
            }
        },
        _sum: {
            lunch: true,
            dinner: true,
            sahri: true
        },
        _count: {
            _all: true
        }
    });

    // C. Projection
    const daysInMonth = endOfCurrentMonthDhaka.getDate();
    const recordedDays = currentMonthStats._count._all;
    const missingDays = Math.max(0, daysInMonth - recordedDays);
    const dbMeals = (currentMonthStats._sum.lunch || 0) + (currentMonthStats._sum.dinner || 0) + (currentMonthStats._sum.sahri || 0);

    // Default Projection (for missing days)
    let projectedDefaultMeals = 0;
    if (user?.status === 'Active') {
        const defL = user.defaultLunchStatus ? 1 : 0;
        const defD = user.defaultDinnerStatus ? 1 : 0;
        const defS = user.defaultSahriStatus ? 1 : 0;
        projectedDefaultMeals = missingDays * (defL + defD + defS);
    }

    const totalProjectedMeals = dbMeals + projectedDefaultMeals;
    currentMonthDynamicCost = totalProjectedMeals * currentRate;

    // Passed Count (Approximation for Dashboard)
    const nowDhaka = getNowDhaka();
    const todayMidnightDhaka = new Date(Date.UTC(nowDhaka.getFullYear(), nowDhaka.getMonth(), nowDhaka.getDate()));

    // So 'date' in DB corresponds to the day.
    const passedStats = await prisma.mealStatus.aggregate({
        where: {
            userId: userId,
            date: {
                gte: startOfCurrentMonthUTC,
                lt: todayMidnightDhaka // Strictly Before Today
            }
        },
        _sum: { lunch: true, dinner: true, sahri: true }
    });

    let passedCount = (passedStats._sum.lunch || 0) + (passedStats._sum.dinner || 0) + (passedStats._sum.sahri || 0);

    // Add Today's If Passed
    const todayRecord = await prisma.mealStatus.findUnique({
        where: {
            date_userId: {
                userId: userId,
                date: todayMidnightDhaka
            }
        }
    });

    const currentHour = nowDhaka.getUTCHours();
    const currentMinute = nowDhaka.getUTCMinutes();
    const nowMins = currentHour * 60 + currentMinute;

    const tL = todayRecord ? todayRecord.lunch : (user?.defaultLunchStatus ? 1 : 0);
    const tD = todayRecord ? todayRecord.dinner : (user?.defaultDinnerStatus ? 1 : 0);
    // Sahri Check for Today
    const isSahriToday = RAMADAN_CONFIG ? (todayMidnightDhaka >= new Date(RAMADAN_CONFIG.START) && todayMidnightDhaka <= new Date(RAMADAN_CONFIG.END)) : false;
    const tS = todayRecord ? todayRecord.sahri : (isSahriToday && user?.defaultSahriStatus ? 1 : 0);

    if (nowMins >= lunchCutoffMins) passedCount += tL;
    if (nowMins >= dinnerCutoffMins) passedCount += tD;
    if (nowMins >= sahriCutoffMins) passedCount += tS;

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


    // 2. Fetch ALL required data in Parallel
    const [
        users,
        settings,
        allSnapshots,
        prevMonthAggregates,
        pastMonthAggregates, // Strictly Past (< Today)
        todayAggregates      // Today Only
    ] = await prisma.$transaction([
        prisma.user.findMany({
            select: { id: true, balance: true, status: true, defaultLunchStatus: true, defaultDinnerStatus: true, defaultSahriStatus: true, createdAt: true }
        }),
        prisma.systemSettings.findMany(),
        prisma.monthlySnapshot.findMany({
            select: { userId: true, month: true, totalCost: true }
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
    const settingsMap = new Map(settings.map(s => [s.key, s.value]));
    const currentRate = parseFloat(settingsMap.get(SETTINGS_KEYS.MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.MEAL_RATE]);
    const prevRate = parseFloat(settingsMap.get(SETTINGS_KEYS.PREV_MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.PREV_MEAL_RATE]);

    const lunchCutoffStr = settingsMap.get(SETTINGS_KEYS.LUNCH_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.LUNCH_CUTOFF];
    const dinnerCutoffStr = settingsMap.get(SETTINGS_KEYS.DINNER_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.DINNER_CUTOFF];
    const sahriCutoffStr = settingsMap.get(SETTINGS_KEYS.SAHRI_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.SAHRI_CUTOFF];

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

    allSnapshots.forEach(s => {
        if (!userClosedMonths.has(s.userId)) userClosedMonths.set(s.userId, new Set());
        userClosedMonths.get(s.userId)?.add(s.month); // "YYYY-MM"

        const currentTotal = userFixedCost.get(s.userId) || 0;
        userFixedCost.set(s.userId, currentTotal + s.totalCost);
    });

    const prevAggMap = new Map();
    prevMonthAggregates.forEach(a => prevAggMap.set(a.userId, a));

    const pastAggMap = new Map();
    pastMonthAggregates.forEach(a => pastAggMap.set(a.userId, a));

    const todayAggMap = new Map();
    todayAggregates.forEach(a => todayAggMap.set(a.userId, a));

    // 5. Calculate per User
    const results = new Map();

    const prevMonthKey = formatMonthKey(prevMonthStartUTC);

    // Current Month Days - PASSED only
    const daysPassedInCurrentMonth = nowDhaka.getDate(); // 1-31

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

            let pastProj = 0;
            if (user.status === 'Active') {
                const yesterdayDate = daysPassedInCurrentMonth - 1;
                let effectiveStartDay = 1;
                const currentMonthStart = new Date(currentMonthStartUTC);
                if (user.createdAt && user.createdAt >= currentMonthStart) {
                    const createdDhaka = new Date(user.createdAt.getTime() + 6 * 60 * 60 * 1000);
                    effectiveStartDay = createdDhaka.getDate();
                }

                let expectedDays = 0;
                if (yesterdayDate >= effectiveStartDay) {
                    expectedDays = yesterdayDate - effectiveStartDay + 1;
                }
                const missingDays = Math.max(0, expectedDays - pastDbCount);
                const defTotal = (user.defaultLunchStatus ? 1 : 0) + (user.defaultDinnerStatus ? 1 : 0) + (user.defaultSahriStatus ? 1 : 0);
                pastProj = missingDays * defTotal;
            }

            // Part 2: Today (Conditional)
            const todayAgg = todayAggMap.get(user.id);
            let todayCostItems = 0;

            const tL = todayAgg ? todayAgg._sum.lunch : (user.defaultLunchStatus ? 1 : 0);
            const tD = todayAgg ? todayAgg._sum.dinner : (user.defaultDinnerStatus ? 1 : 0);
            const tS = todayAgg ? todayAgg._sum.sahri : (isSahriToday && user.defaultSahriStatus ? 1 : 0);

            if (nowMins >= lunchCutoffMins) todayCostItems += tL;
            if (nowMins >= dinnerCutoffMins) todayCostItems += tD;
            if (nowMins >= sahriCutoffMins) todayCostItems += tS;

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
