'use server';

import { z } from 'zod';
import { auth } from '@/auth';
import { revalidatePath, revalidateTag } from 'next/cache';
import { prisma } from '@/app/lib/prisma';
import { uploadImage } from '@/app/lib/storage';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { isSahriActive } from '@/app/lib/meals/utils';

// We import the granular services instead of barrel files!
import { getSystemSettings } from '@/app/lib/settings-actions';

const ExpenseSchema = z.object({
    description: z.string().min(2, "Description too short"),
    amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
    volume: z.string().optional().or(z.literal('')),
    unit: z.coerce.number().optional(),
    unitPrice: z.coerce.number().optional(),
});

export async function addExpense(prevState: unknown, formData: FormData) {
    const session = await auth();
    if (!session?.user?.email) {
        return { error: "You must be logged in." };
    }

    const purchaser = await prisma.user.findUnique({
        where: { email: session.user.email }
    });

    if (!purchaser) return { error: "User not found." };

    const validatedFields = ExpenseSchema.safeParse({
        description: formData.get('description'),
        amount: formData.get('amount'),
        volume: formData.get('volume'),
        unit: formData.get('unit'),
        unitPrice: formData.get('unitPrice'),
    });

    if (!validatedFields.success) {
        return { error: 'Invalid input.' };
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
        return { error: 'Database Error: Failed to Add Expense.' };
    }

    revalidatePath('/dashboard');
    return { success: 'Expense added successfully!' };
}

const ExpenseItemSchema = z.object({
    description: z.string().min(1, "Description required"),
    volume: z.string().optional(),
    unit: z.coerce.number().optional(),
    unitPrice: z.coerce.number().optional(),
    amount: z.coerce.number().gt(0, "Amount/Cost required"),
});

export async function addBatchExpenses(prevState: { error?: string; success?: string } | null, formData: FormData) {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const purchaser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!purchaser) return { error: 'User not found.' };
    if (!purchaser.isAdmin) return { error: 'Admin access required.' };
    const userId = purchaser.id;

    interface ExpenseEntry {
        description: string;
        volume?: string;
        unit?: unknown;
        unitPrice?: unknown;
        amount: unknown;
        imageFile: File;
        index: number;
    }

    const entries: ExpenseEntry[] = [];
    let i = 0;
    while (formData.has(`entry_${i}_description`)) {
        const description = formData.get(`entry_${i}_description`) as string;
        const volume = formData.get(`entry_${i}_volume`) as string;
        const unit = formData.get(`entry_${i}_unit`);
        const unitPrice = formData.get(`entry_${i}_unitPrice`);
        const amount = formData.get(`entry_${i}_amount`);
        const imageFile = formData.get(`entry_${i}_image`) as File;

        entries.push({ description, volume, unit, unitPrice, amount, imageFile, index: i });
        i++;
    }

    if (entries.length === 0) return { error: "No items to add." };

    let successCount = 0;
    const errors: string[] = [];
    const batchToInsert: {
        description: string;
        amount: number;
        volume: string | null;
        unit: number | null;
        unitPrice: number | null;
        purchaserId: string;
        imagePath: string | null;
    }[] = [];

    for (const item of entries) {
        const validated = ExpenseItemSchema.safeParse({
            description: item.description,
            volume: item.volume,
            unit: item.unit,
            unitPrice: item.unitPrice,
            amount: item.amount
        });

        if (!validated.success) {
            errors.push(`Item ${item.index + 1}: Invalid data`);
            continue;
        }

        if (item.imageFile && item.imageFile.size > 0) {
            const imagePath = await uploadImage(item.imageFile, 'expenses');
            if (!imagePath) {
                errors.push(`Item ${item.index + 1}: Image upload failed`);
                continue;
            }

            try {
                await prisma.expense.create({
                    data: {
                        ...validated.data,
                        imagePath,
                        purchaserId: userId,
                    }
                });
                successCount++;
            } catch (e) {
                console.error(e);
                errors.push(`Item ${item.index + 1}: DB Error`);
            }
        } else {
            batchToInsert.push({
                description: validated.data.description,
                amount: validated.data.amount,
                volume: validated.data.volume ?? null,
                unit: validated.data.unit ?? null,
                unitPrice: validated.data.unitPrice ?? null,
                purchaserId: userId,
                imagePath: null,
            });
        }
    }

    if (batchToInsert.length > 0) {
        try {
            const result = await prisma.expense.createMany({
                data: batchToInsert,
            });
            successCount += result.count;
        } catch (e) {
            console.error(e);
            errors.push(`Bulk Insert Error: Failed to add ${batchToInsert.length} items without images.`);
        }
    }

    revalidatePath('/dashboard');

    if (errors.length > 0) {
        return { error: `Added ${successCount} items. ${errors.length} issues found: ${errors.slice(0, 2).join('; ')}${errors.length > 2 ? '...' : ''}` };
    }

    return { success: `Successfully added ${successCount} items!` };
}

export async function finalizeMonth(userId: string, year: number, monthNum: number, rate: number): Promise<{ success?: string; error?: string; count?: number; cost?: number }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser?.isAdmin) return { error: "Unauthorized: Admin access required." };

    const startUTC = new Date(Date.UTC(year, monthNum - 1, 1));
    const endUTC = new Date(Date.UTC(year, monthNum, 0));

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { defaultLunchStatus: true, defaultDinnerStatus: true, defaultSahriStatus: true }
    });
    if (!user) return { error: 'User not found' };

    const [meals, statusLogs, initialStatusLog] = await Promise.all([
        prisma.mealStatus.findMany({
            where: {
                userId: userId,
                date: { gte: startUTC, lte: endUTC }
            }
        }),
        prisma.userStatusLog.findMany({
            where: {
                userId: userId,
                changedAt: { gte: startUTC, lte: new Date(endUTC.getTime() + 24 * 60 * 60 * 1000) }
            },
            orderBy: { changedAt: 'asc' }
        }),
        prisma.userStatusLog.findFirst({
            where: {
                userId: userId,
                changedAt: { lt: startUTC }
            },
            orderBy: { changedAt: 'desc' }
        })
    ]);

    const mealMap = new Map<string, typeof meals[0]>();
    meals.forEach(m => mealMap.set(m.date.toISOString().split('T')[0], m));

    let totalMeals = 0;
    const daysInMonth = endUTC.getUTCDate();

    let currentStatus = initialStatusLog?.status || 'Active';
    let logIdx = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateUTC = new Date(Date.UTC(year, monthNum - 1, day));
        const dateKey = dateUTC.toISOString().split('T')[0];

        const dayEnd = new Date(dateUTC.getTime() + 24 * 60 * 60 * 1000 - 1);
        while (logIdx < statusLogs.length && statusLogs[logIdx].changedAt <= dayEnd) {
            currentStatus = statusLogs[logIdx].status;
            logIdx++;
        }

        const record = mealMap.get(dateKey);

        if (record) {
            totalMeals += Number(record.lunch) + Number(record.dinner) + Number(record.sahri);
        } else if (currentStatus === 'Active') {
            const defL = user.defaultLunchStatus ? 1 : 0;
            const defD = user.defaultDinnerStatus ? 1 : 0;
            const defS = (isSahriActive(dateUTC) && user.defaultSahriStatus) ? 1 : 0;
            totalMeals += defL + defD + defS;
        }
    }

    const totalCost = totalMeals * rate;
    const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;

    try {
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
    } catch (e) {
        console.error("Database Error:", e);
        return { error: 'Database Error: Failed to finalize month.' };
    }


    revalidatePath('/dashboard');
    return { success: `Month ${monthKey} finalized for user.`, count: totalMeals, cost: totalCost };
}

export async function autoComputePrevMonthRate(year: number, monthNum: number): Promise<{ success?: string; error?: string; rate?: number; totalExpenses?: number; totalMeals?: number; saved?: boolean }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser?.isAdmin) return { error: "Unauthorized: Admin access required." };

    const startUTC = new Date(Date.UTC(year, monthNum - 1, 1));
    const endUTC = new Date(Date.UTC(year, monthNum, 0));

    const expStartUTC = new Date(startUTC.getTime() - 6 * 60 * 60 * 1000);
    const expEndUTC = new Date(endUTC.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);

    const [expenseAgg, mealAgg] = await Promise.all([
        prisma.expense.aggregate({
            where: { date: { gte: expStartUTC, lte: expEndUTC } },
            _sum: { amount: true }
        }),
        prisma.mealStatus.aggregate({
            where: { date: { gte: startUTC, lte: endUTC } },
            _sum: { lunch: true, dinner: true, sahri: true }
        })
    ]);

    const totalExpenses = expenseAgg._sum.amount || 0;
    const totalMeals = (mealAgg._sum.lunch || 0) + (mealAgg._sum.dinner || 0) + (mealAgg._sum.sahri || 0);

    if (totalMeals === 0) {
        return { error: 'No meals recorded for this month' };
    }

    const rate = Math.ceil((totalExpenses / totalMeals) * 100) / 100;

    await prisma.$transaction([
        prisma.systemSettings.upsert({
            where: { key: SETTINGS_KEYS.PREV_MEAL_RATE },
            update: { value: String(rate) },
            create: { key: SETTINGS_KEYS.PREV_MEAL_RATE, value: String(rate) }
        }),
        prisma.systemSettings.upsert({
            where: { key: SETTINGS_KEYS.PREV_MEAL_RATE_SOURCE },
            update: { value: 'auto' },
            create: { key: SETTINGS_KEYS.PREV_MEAL_RATE_SOURCE, value: 'auto' }
        })
    ]);

    revalidateTag('settings', 'default');
    revalidatePath('/dashboard/admin/settings');

    return { success: `Previous month rate computed and saved as ${rate}.`, rate, totalExpenses, totalMeals, saved: true };
}
