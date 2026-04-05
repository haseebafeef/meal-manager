'use server';

import { z } from 'zod';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/app/lib/prisma';
import { uploadImage } from '@/app/lib/storage';

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
