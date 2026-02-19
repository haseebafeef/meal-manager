'use server';

import { z } from 'zod';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/app/lib/prisma';
import { uploadImage } from '@/app/lib/storage';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { getUserSummary } from './queries';

const ExpenseSchema = z.object({
    description: z.string().min(2, "Description too short"),
    amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
    volume: z.string().optional().or(z.literal('')),
    unit: z.coerce.number().optional(),
    unitPrice: z.coerce.number().optional(),
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

// Batch processing 
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

        totalMeals += Number(m.lunch) + Number(m.dinner) + Number(m.sahri);
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

/**
 * Synchronizes a user's active/inactive status based on their current balance.
 * If balance drops below AUTO_OFF_THRESHOLD, they become Inactive.
 * If balance returns to >= 0, they become Active.
 */
export async function syncUserStatus(userId: string, existingSettingsMap?: Map<string, string>) {

    let settingsMap = existingSettingsMap;
    if (!settingsMap) {
        const settings = await prisma.systemSettings.findMany();
        settingsMap = new Map(settings.map(s => [s.key, s.value]));
    }

    const threshold = parseFloat(settingsMap.get(SETTINGS_KEYS.AUTO_OFF_THRESHOLD) || '-300');

    // Get current balance and status (Pass map optimization)
    const summary = await getUserSummary(userId, settingsMap);
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
