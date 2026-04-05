'use server';

import { z } from 'zod';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/app/lib/prisma';
import { uploadImage } from '@/app/lib/storage';

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
