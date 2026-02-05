'use server';

import { z } from 'zod';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { getStartOfMonthDhaka, getNowDhaka } from '@/app/lib/utils';
import { getMonthlyMealHistory } from '@/app/lib/meal-actions';
import { SETTINGS_KEYS, DEFAULT_SETTINGS } from '@/app/lib/constants';


import { prisma } from '@/app/lib/prisma';
import { uploadImage } from '@/app/lib/storage';

const ExpenseSchema = z.object({
    description: z.string().min(2, "Description too short"),
    amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
    volume: z.string().optional().or(z.literal('')), // Unit Name (e.g. kg)
    unit: z.coerce.number().optional(),             // Quantity (e.g. 5)
    unitPrice: z.coerce.number().optional(),        // Rate (e.g. 50)
});

export async function addExpense(prevState: { message: string } | undefined, formData: FormData) {
    const session = await auth();
    if (!session?.user?.email) {
        return { message: "You must be logged in." };
    }

    const purchaser = await prisma.user.findUnique({
        where: { email: session.user.email }
    });

    if (!purchaser) return { message: "User not found." };

    const validatedFields = ExpenseSchema.safeParse({
        description: formData.get('description'),
        amount: formData.get('amount'),
        volume: formData.get('volume'),
        unit: formData.get('unit'),
        unitPrice: formData.get('unitPrice'),
    });

    if (!validatedFields.success) {
        return { message: 'Invalid input.' };
    }

    const { description, amount, volume, unit, unitPrice } = validatedFields.data;
    const imageFile = formData.get('image') as File;

    let imagePath = null;
    if (imageFile && imageFile.size > 0) {
        imagePath = await uploadImage(imageFile, 'expenses');
    }

    try {
        await prisma.expense.create({
            data: {
                description,
                amount,
                volume: volume || null,
                unit: unit || null,
                unitPrice: unitPrice || null,
                imagePath: imagePath,
                purchaserId: purchaser.id,
            },
        });
    } catch (error) {
        console.error("Database Error:", error);
        return { message: 'Database Error: Failed to Add Expense.' };
    }

    revalidatePath('/dashboard');
    return { message: 'Expense added successfully!' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getExpenses(): Promise<any> {
    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

    return await prisma.expense.findMany({
        where: {
            date: { gte: twentyDaysAgo }
        },
        orderBy: { date: 'desc' },
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

// Batch processing for multiple expense records including image attachments
const ExpenseItemSchema = z.object({
    description: z.string().min(1, "Description required"),
    volume: z.string().optional(),
    unit: z.coerce.number().optional(),
    unitPrice: z.coerce.number().optional(),
    amount: z.coerce.number().gt(0, "Amount/Cost required"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addBatchExpenses(prevState: any, formData: FormData) {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userId = (session.user as any).id;
    if (!userId && session.user.email) {
        const user = await prisma.user.findFirst({ where: { email: session.user.email } });
        userId = user?.id;
    }

    if (!userId) {
        const purchaserVal = await prisma.user.findUnique({ where: { email: session.user.email ?? '' } });
        if (purchaserVal) userId = purchaserVal.id;
        else return { error: "User not found" };
    }

    const entries = [];
    let i = 0;
    while (formData.has(`entry_${i}_description`)) {
        entries.push(i);
        i++;
    }

    if (entries.length === 0) return { error: "No items to add." };

    let successCount = 0;
    const errors = [];

    // Local upload dir setup removed


    for (const index of entries) {
        const description = formData.get(`entry_${index}_description`) as string;
        const volume = formData.get(`entry_${index}_volume`);
        const unit = formData.get(`entry_${index}_unit`);
        const unitPrice = formData.get(`entry_${index}_unitPrice`);
        const amount = formData.get(`entry_${index}_amount`);
        const imageFile = formData.get(`entry_${index}_image`) as File;

        const validated = ExpenseItemSchema.safeParse({
            description,
            volume,
            unit,
            unitPrice,
            amount
        });

        if (!validated.success) {
            errors.push(`Item ${index + 1}: Invalid data`);
            continue;
        }

        let imagePath = null;
        if (imageFile && imageFile.size > 0) {
            imagePath = await uploadImage(imageFile, 'expenses');
            if (!imagePath) {
                errors.push(`Item ${index + 1}: Image upload failed`);
            }
        }

        try {
            await prisma.expense.create({
                data: {
                    description: validated.data.description,
                    amount: validated.data.amount,
                    volume: validated.data.volume,
                    unit: validated.data.unit,
                    unitPrice: validated.data.unitPrice,
                    imagePath: imagePath,
                    purchaserId: userId,
                }
            });
            successCount++;
        } catch (e) {
            console.error(e);
            errors.push(`Item ${index + 1}: DB Error`);
        }
    }

    revalidatePath('/dashboard');

    if (errors.length > 0) {
        return { error: `Added ${successCount} items. Errors: ${errors.join(', ')}` };
    }

    return { success: `Successfully added ${successCount} items!` };
}


export async function getSystemSummary() {
    // 1. Current Month Expenses
    // Calculate the start of the current month in UTC, adjusted for the local offset (UTC+6)
    // to ensure accurate monthly data retrieval relative to local business hours.
    const dhakaStart = getStartOfMonthDhaka();
    const queryStart = new Date(dhakaStart.getTime() - 6 * 60 * 60 * 1000);

    // 1. Current Month Expenses
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



// Helper to parse HH:MM to Minutes
function parseTimeToMinutes(timeStr: string) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}


// Helper: Format Date to YYYY-MM
function formatMonthKey(date: Date) {
    const d = new Date(date.getTime() + 6 * 60 * 60 * 1000); // Shift to local time for key generation
    return d.toISOString().slice(0, 7); // "YYYY-MM"
}

export async function finalizeMonth(userId: string, year: number, monthNum: number, rate: number) {
    // 1. Determine Range (Dhaka Time)
    // Month is 1-indexed
    const startDhaka = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0));
    const startUTC = new Date(startDhaka.getTime() - 6 * 60 * 60 * 1000);

    const endDhaka = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0));
    const endUTC = new Date(endDhaka.getTime() - 6 * 60 * 60 * 1000);

    // 2. Calculate Usage
    const meals = await prisma.mealStatus.findMany({
        where: {
            userId: userId,
            date: { gte: startUTC, lt: endUTC }
        }
    });

    let totalMeals = 0;
    for (const m of meals) {
        totalMeals += Number(m.lunch) + Number(m.dinner);
    }

    const totalCost = totalMeals * rate;
    const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;

    // 3. Save Snapshot
    await prisma.monthlySnapshot.upsert({
        where: { userId_month: { userId, month: monthKey } },
        update: { mealRate: rate, totalMeals, totalCost },
        create: {
            userId,
            month: monthKey,
            year,
            monthNum,
            mealRate: rate,
            totalMeals,
            totalCost
        }
    });

    revalidatePath('/dashboard');
    return { success: true, count: totalMeals, cost: totalCost };
}

export async function getUserSummary(userId: string) {
    const startOfCurrentMonthDhaka = getStartOfMonthDhaka();
    const queryStartCurrentMonth = new Date(startOfCurrentMonthDhaka.getTime() - 6 * 60 * 60 * 1000); // Feb 1 00:00 Dhaka -> Jan 31 18:00 UTC

    // Calculate Start of Previous Month
    // (Month index wrap is handled by JavaScript's setMonth)
    const startOfPrevMonthDhaka = new Date(startOfCurrentMonthDhaka);
    startOfPrevMonthDhaka.setMonth(startOfPrevMonthDhaka.getMonth() - 1);
    const queryStartPrevMonth = new Date(startOfPrevMonthDhaka.getTime() - 6 * 60 * 60 * 1000);

    // 1. Fetch Settings
    const settings = await prisma.systemSettings.findMany();
    const settingsMap = new Map(settings.map(s => [s.key, s.value]));

    const lunchCutoffStr = settingsMap.get(SETTINGS_KEYS.LUNCH_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.LUNCH_CUTOFF];
    const dinnerCutoffStr = settingsMap.get(SETTINGS_KEYS.DINNER_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.DINNER_CUTOFF];
    const currentRate = parseFloat(settingsMap.get(SETTINGS_KEYS.MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.MEAL_RATE]);
    const prevRate = parseFloat(settingsMap.get(SETTINGS_KEYS.PREV_MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.PREV_MEAL_RATE]);

    const lunchCutoffMins = parseTimeToMinutes(lunchCutoffStr);
    const dinnerCutoffMins = parseTimeToMinutes(dinnerCutoffStr);

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

    // 4. Fetch Meal Statuses (Last 18 Months Only)
    // We limit history scan to keep dashboard fast. Older months are assumed snapshotted or irrelevant for daily view.
    const historyLimit = new Date();
    historyLimit.setMonth(historyLimit.getMonth() - 18);

    const allMeals = await prisma.mealStatus.findMany({
        where: {
            userId: userId,
            date: { gte: historyLimit }
        }
    });

    const mealMap = new Map();
    allMeals.forEach(m => {
        // Normalize key to "YYYY-MM-DD" based on strict UTC strings.
        // m.date is Midnight UTC.
        const key = m.date.toISOString().split('T')[0];
        mealMap.set(key, m);
    });

    // Gap Detection
    const gapMealsMap = new Map<string, { count: number, year: number, monthNum: number }>();

    let snapshotsCost = 0;
    let prevMonthDynamicCost = 0; // Legacy / Fallback
    let currentMonthDynamicCost = 0;
    let currentMonthPassedCount = 0;

    // Time Logic for Today
    const nowDhaka = getNowDhaka();
    const currentDay = nowDhaka.getUTCDate();
    const currentHour = nowDhaka.getUTCHours();
    const currentMinute = nowDhaka.getUTCMinutes();
    const nowMins = currentHour * 60 + currentMinute;

    // A. Current Month Calculation (Iteration Loop)
    // Iterate through daily records for the current month to calculate "Passed" meals.
    // Meals are considered "Passed" once they cross the respective cutoff times.
    const cmStart = new Date(queryStartCurrentMonth);
    const cmDhaka = new Date(cmStart.getTime() + 6 * 60 * 60 * 1000);
    const cmYear = cmDhaka.getFullYear();
    const cmMonth = cmDhaka.getMonth(); // 0-11
    const daysInMonth = new Date(cmYear, cmMonth + 1, 0).getDate();

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
        // Construct UTC Midnight for this Dhaka day
        const targetDate = new Date(Date.UTC(cmYear, cmMonth, dayNum));
        const dateKey = targetDate.toISOString().split('T')[0];

        const status = mealMap.get(dateKey);

        // Active status determination using timeline logs
        // This ensures historical accuracy if a user's status changed during the period.
        const dayEnd = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1);

        let isActive = true;
        let computedStatus = 'Active';
        if (user?.statusLogs) {
            const activeLogs = user.statusLogs.filter(log => log.changedAt <= dayEnd);
            if (activeLogs.length > 0) {
                computedStatus = activeLogs[activeLogs.length - 1].status;
            }
        }

        isActive = (computedStatus === 'Active');

        // Validation against user creation date
        if (user?.createdAt && user.createdAt > dayEnd) {
            isActive = false;
        }

        // Default Logic
        let l = 1;
        let d = 1;

        if (status) {
            l = status.lunch;
            d = status.dinner;
        } else {
            if (!isActive) {
                l = 0;
                d = 0;
            } else {
                l = user?.defaultLunchStatus ? 1 : 0;
                d = user?.defaultDinnerStatus ? 1 : 0;
            }
        }

        // Passed Check
        let passedL = 0;
        let passedD = 0;

        // isDayPast Logic inline
        if (dayNum < currentDay) {
            // Past
            passedL = l;
            passedD = d;
        } else if (dayNum === currentDay) {
            // Today
            if (nowMins >= lunchCutoffMins) passedL = l;
            if (nowMins >= dinnerCutoffMins) passedD = d;
        }

        // Add to Totals
        currentMonthDynamicCost += (l + d) * currentRate;
        currentMonthPassedCount += (passedL + passedD);
    }


    // B. Previous Month / Gaps Logic
    // Iterate through all meals to handle "Pre-Current Month" items or gaps.
    for (const m of allMeals) {
        if (m.date >= queryStartCurrentMonth) {
            // Handled by Loop A ??
            // Loop A iterates RULES (Default ON). 
            // `allMeals` are EXCEPTIONS (or explicit).
            // Loop A checks `mealMap`. So `allMeals` content IS used in Loop A.
            // We just need to handle "Pre-Current Month" items here.
            continue;
        }

        const l = Number(m.lunch);
        const d = Number(m.dinner);

        if (m.date >= queryStartPrevMonth) {
            // Prev Month Dynamic
            prevMonthDynamicCost += (l + d) * prevRate;
        } else {
            // Legacy / Gap
            const key = formatMonthKey(m.date);
            if (!snapshotMap.has(key)) {
                if (!gapMealsMap.has(key)) {
                    const dKy = new Date(m.date.getTime() + 6 * 60 * 60 * 1000);
                    gapMealsMap.set(key, { count: 0, year: dKy.getFullYear(), monthNum: dKy.getMonth() + 1 });
                }
                const entry = gapMealsMap.get(key)!;
                entry.count += (l + d);
            }
        }
    }

    // Process Gaps: Auto-finalize months that weren't manually closed.
    // Note: Performing this write-on-read ensures historical data is eventually consistent without a background job.
    for (const [key, data] of gapMealsMap.entries()) {
        const cost = data.count * prevRate; // Rule: Use PREVIOUS_MEAL_RATE for Auto-Close

        // Fire and forget? No, wait to be accurate.
        try {
            await prisma.monthlySnapshot.create({
                data: {
                    userId,
                    month: key,
                    year: data.year,
                    monthNum: data.monthNum,
                    mealRate: prevRate,
                    totalMeals: data.count,
                    totalCost: cost
                }
            });
            // Add to map so we sum it immediately
            snapshotMap.set(key, cost);
        } catch (e) {
            // Race condition or duplicate key? Ignore, assume exists
            console.error("Auto-snapshot failed (likely exists):", key, e);
        }
    }

    // Sum all Snapshots (Existing + Newly Created)
    snapshotsCost = Array.from(snapshotMap.values()).reduce((a, b) => a + b, 0);

    // Calculate Current Cost
    currentMonthDynamicCost = currentMonthPassedCount * currentRate;

    const totalCost = snapshotsCost + prevMonthDynamicCost + currentMonthDynamicCost;
    const trueRemainingBalance = totalDeposits - totalCost;

    // Previous Month Balance (Opening Balance of This Month)
    // Formula: (Total Deposits - Current Credit) - (Historical Costs + Prev Month Dynamic Costs)



    const depositsBeforeThisMonth = totalDeposits - currentMonthCredit;
    const prevMonthBalance = depositsBeforeThisMonth - (snapshotsCost + prevMonthDynamicCost);

    // Auto-sync status based on new balance
    // REMOVED RECURSIVE CALL: await syncUserStatus(userId); 
    // This was causing infinite loop: getUserSummary -> syncUserStatus -> getUserSummary...

    return {
        previousMonthBalance: prevMonthBalance,
        currentMonthCredit: currentMonthCredit,
        currentMonthUsed: currentMonthDynamicCost,
        remainingBalance: trueRemainingBalance,
        passedMealCount: currentMonthPassedCount
    };
}

// --- OPTIMIZED BATCH FUNCTION ---
export async function getBatchUserSummaries() {
    // 1. Setup Time Boundaries
    const nowDhaka = getNowDhaka();
    const currentMonthStartDhaka = getStartOfMonthDhaka();
    const currentMonthStartUTC = new Date(currentMonthStartDhaka.getTime() - 6 * 60 * 60 * 1000); // Shift for DB query

    const prevMonthStartDhaka = new Date(currentMonthStartDhaka);
    prevMonthStartDhaka.setMonth(prevMonthStartDhaka.getMonth() - 1);
    const prevMonthStartUTC = new Date(prevMonthStartDhaka.getTime() - 6 * 60 * 60 * 1000);

    // 2. Fetch ALL required data in Parallel
    // 2. Fetch ALL required data in Parallel
    const [
        users,
        settings,
        allSnapshots,
        recentMeals
    ] = await prisma.$transaction([
        prisma.user.findMany({
            include: {
                statusLogs: { orderBy: { changedAt: 'asc' } }
            }
        }),
        prisma.systemSettings.findMany(),
        // Fetch detailed snapshots for granularity (checking which months are closed)
        prisma.monthlySnapshot.findMany({
            select: { userId: true, month: true, totalCost: true }
        }),
        prisma.mealStatus.findMany({
            where: {
                date: { gte: prevMonthStartUTC }
            }
        })
    ]);

    // 3. Process Settings
    const settingsMap = new Map(settings.map(s => [s.key, s.value]));
    const currentRate = parseFloat(settingsMap.get(SETTINGS_KEYS.MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.MEAL_RATE]);
    const prevRate = parseFloat(settingsMap.get(SETTINGS_KEYS.PREV_MEAL_RATE) || DEFAULT_SETTINGS[SETTINGS_KEYS.PREV_MEAL_RATE]);
    const lunchCutoffStr = settingsMap.get(SETTINGS_KEYS.LUNCH_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.LUNCH_CUTOFF];
    const dinnerCutoffStr = settingsMap.get(SETTINGS_KEYS.DINNER_CUTOFF) || DEFAULT_SETTINGS[SETTINGS_KEYS.DINNER_CUTOFF];
    const lunchCutoffMins = parseTimeToMinutes(lunchCutoffStr);
    const dinnerCutoffMins = parseTimeToMinutes(dinnerCutoffStr);

    const nowMins = nowDhaka.getUTCHours() * 60 + nowDhaka.getUTCMinutes();
    const currentDay = nowDhaka.getUTCDate();




    // 4. Index Data for O(1) Access

    // Process Snapshots: Build BOTH Cost Sums and Closed Month Sets
    const userClosedMonths = new Map<string, Set<string>>();
    const userFixedCost = new Map<string, number>();

    allSnapshots.forEach(s => {
        if (!userClosedMonths.has(s.userId)) userClosedMonths.set(s.userId, new Set());
        userClosedMonths.get(s.userId)?.add(s.month); // "YYYY-MM"

        const currentTotal = userFixedCost.get(s.userId) || 0;
        userFixedCost.set(s.userId, currentTotal + s.totalCost);
    });

    // Group meals by UserId -> DateKey
    const mealsByUser = new Map<string, Map<string, (typeof recentMeals)[0]>>();
    recentMeals.forEach(m => {
        if (!mealsByUser.has(m.userId)) mealsByUser.set(m.userId, new Map());
        const dateKey = m.date.toISOString().split('T')[0];
        mealsByUser.get(m.userId)?.set(dateKey, m);
    });

    // 5. Calculate per User
    const results = new Map();

    for (const user of users) {
        // A. Fixed History
        let totalCost = userFixedCost.get(user.id) || 0;
        const closedMonths = userClosedMonths.get(user.id) || new Set();

        // B. Dynamic Recent (Prev + Current)
        const userMealsMap = mealsByUser.get(user.id) || new Map();

        // 1. Previous Month (Iterate days)
        const pmKey = formatMonthKey(prevMonthStartUTC); // "YYYY-MM"
        if (!closedMonths.has(pmKey)) {
            // Dynamic Calc for Prev Month
            const pmDhaka = new Date(prevMonthStartDhaka);
            const pmYear = pmDhaka.getFullYear();
            const pmMonth = pmDhaka.getMonth();
            const daysInPrevMonth = new Date(pmYear, pmMonth + 1, 0).getDate();



            for (let d = 1; d <= daysInPrevMonth; d++) {
                const targetDate = new Date(Date.UTC(pmYear, pmMonth, d));
                const dateKey = targetDate.toISOString().split('T')[0];
                const status = userMealsMap.get(dateKey); // Explicit Meal

                // Determine historical active status based on logs up to this date
                const dayEnd = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1);

                let computedStatus = 'Active';
                if (user.statusLogs) {
                    const activeLogs = user.statusLogs.filter(log => log.changedAt <= dayEnd);
                    if (activeLogs.length > 0) {
                        computedStatus = activeLogs[activeLogs.length - 1].status;
                    }
                }

                let isActive = (computedStatus === 'Active');
                if (user.createdAt > dayEnd) isActive = false;

                // Default to 'Active' if no logs exist, unless created after this date

                let l = 1, dMeal = 1;
                if (status) { l = status.lunch; dMeal = status.dinner; }
                else if (!isActive) { l = 0; dMeal = 0; }
                else { l = user.defaultLunchStatus ? 1 : 0; dMeal = user.defaultDinnerStatus ? 1 : 0; }

                totalCost += (l + dMeal) * prevRate;
            }
        }

        // 2. Current Month (Iterate days up to today/end)
        const cmKey = formatMonthKey(currentMonthStartUTC);
        if (!closedMonths.has(cmKey)) {
            const cmDhaka = new Date(currentMonthStartDhaka);
            const cmYear = cmDhaka.getFullYear();
            const cmMonth = cmDhaka.getMonth(); // 0-11
            const daysInCurrentMonth = new Date(cmYear, cmMonth + 1, 0).getDate();

            for (let d = 1; d <= daysInCurrentMonth; d++) {
                const targetDate = new Date(Date.UTC(cmYear, cmMonth, d));
                const dateKey = targetDate.toISOString().split('T')[0];
                const status = userMealsMap.get(dateKey);

                // Date logic
                const isPast = d < currentDay;
                const isToday = d === currentDay;

                // Determine historical active status based on logs up to this date
                const dayEnd = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1);

                let computedStatus = 'Active';
                if (user.statusLogs) {
                    const activeLogs = user.statusLogs.filter(log => log.changedAt <= dayEnd);
                    if (activeLogs.length > 0) {
                        computedStatus = activeLogs[activeLogs.length - 1].status;
                    }
                }

                let isActive = (computedStatus === 'Active');
                if (user.createdAt > dayEnd) isActive = false;

                let l = 1, dMeal = 1;
                if (status) { l = status.lunch; dMeal = status.dinner; }
                else if (!isActive) { l = 0; dMeal = 0; }
                else { l = user.defaultLunchStatus ? 1 : 0; dMeal = user.defaultDinnerStatus ? 1 : 0; }

                // Passed Check
                let passedL = 0, passedD = 0;
                if (isPast) { passedL = l; passedD = dMeal; }
                else if (isToday) {
                    if (nowMins >= lunchCutoffMins) passedL = l;
                    if (nowMins >= dinnerCutoffMins) passedD = dMeal;
                }

                totalCost += (passedL + passedD) * currentRate;
            }
        }

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
        memo: e.description // Using description as Memo, unless separate field needed
    }));
}

export async function getMonthlyExpenses(year: number, month: number) {
    // Determine start and end of the month in UTC, adjusted for Dhaka offset
    // Dhaka is UTC+6.
    // "Year-Month" requested is Face Value (e.g. Feb 2026).
    // Start: Feb 1 00:00 Dhaka -> Jan 31 18:00 UTC
    // End: Mar 1 00:00 Dhaka -> Feb 28 18:00 UTC (approx)

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
                select: { name: true, nickname: true, image: true }
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
            purchaserImage: e.purchaser.image
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

    // Start of Request Month (Dhaka 00:00) -> UTC (Previous Day 18:00)
    const startDhaka = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const startUTC = new Date(startDhaka.getTime() - 6 * 60 * 60 * 1000);

    // Start of Next Month (Dhaka 00:00) -> UTC (End of Request Month effectively)
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
    // All time BEFORE startUTC
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
    // We reuse the logic from getMonthlyMealHistory which handles "Dhaka Day" buckets correctly.
    // month is 1-indexed here, getMonthlyMealHistory expects month index (0 for Jan) if consistent with JS Date?
    // Let's verify: In meal-actions, getMonthlyMealHistory checks Date.UTC(year, month, 1). 
    // If we want Feb, we pass month=1. 
    // Here `month` param is 1-indexed (Feb=2). So pass `month - 1`.
    const mealHistory = await getMonthlyMealHistory(year, month - 1);

    // Sum only PASSED meals for history/summary purposes
    const totalMeals = mealHistory.reduce((sum, day) => sum + (day.passedLunchCount || 0) + (day.passedDinnerCount || 0), 0);

    return {
        previousMonthBalance: prevBalance,
        currentMonthCredit: totalCreditCurrent,
        currentMonthExpenses: totalExpensesCurrent,
        remainingFund: remainingFund,
        totalMeals: totalMeals
    };
}

/**
 * Synchronizes a user's active/inactive status based on their current balance.
 * If balance drops below AUTO_OFF_THRESHOLD, they become Inactive.
 * If balance returns to >= 0, they become Active.
 */
export async function syncUserStatus(userId: string) {
    const settings = await prisma.systemSettings.findMany();
    const settingsMap = new Map(settings.map(s => [s.key, s.value]));
    const threshold = parseFloat(settingsMap.get(SETTINGS_KEYS.AUTO_OFF_THRESHOLD) || '-300');

    // Get current balance and status
    const summary = await getUserSummary(userId);
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { status: true }
    });

    if (!user) return;

    let newStatus: string | null = null;

    if (summary.remainingBalance < threshold && user.status === 'Active') {
        newStatus = 'Inactive';
    } else if (summary.remainingBalance >= 0 && user.status === 'Inactive') {
        newStatus = 'Active';
    }

    if (newStatus) {
        await prisma.$transaction([
            prisma.user.update({
                where: { id: userId },
                data: { status: newStatus }
            }),
            prisma.userStatusLog.create({
                data: {
                    userId: userId,
                    status: newStatus
                }
            })
        ]);
        revalidatePath('/dashboard/admin/users');
        revalidatePath('/dashboard/meals');
    }
}
