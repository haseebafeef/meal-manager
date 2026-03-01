'use server';

import { z } from 'zod';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { syncUserStatus } from './expense-actions';

import { prisma } from '@/app/lib/prisma';

const TransactionSchema = z.object({
    amount: z.coerce.number().gt(0, "Amount must be greater than zero"),
    receiverId: z.string().min(1, "Please select a receiver"),
    paymentMethod: z.string().min(1, "Please select a payment method"),
    note: z.string().optional(),
});

const AdminAddMoneySchema = z.object({
    userId: z.string(),
    amount: z.coerce.number().refine((val) => val !== 0, "Amount cannot be zero"),
    paymentMethod: z.string().optional(),
    note: z.string().optional(),
});

export async function createBalanceRequest(prevState: unknown, formData: FormData): Promise<{ success?: string; error?: string }> {
    const session = await auth();
    if (!session?.user?.email) {
        return { error: "You must be logged in." };
    }

    // Get current user ID from DB to be safe
    const sender = await prisma.user.findUnique({
        where: { email: session.user.email }
    });

    if (!sender) return { error: "User not found." };
    if (sender.status !== 'Active') return { error: "Your account is inactive." };

    const validatedFields = TransactionSchema.safeParse({
        amount: formData.get('amount'),
        receiverId: formData.get('receiverId'),
        paymentMethod: formData.get('paymentMethod'),
        note: formData.get('note'),
    });

    if (!validatedFields.success) {
        return { error: 'Invalid input. Please check all fields.' };
    }

    const { amount, receiverId, paymentMethod, note } = validatedFields.data;

    // Fetch receiver to name them in description
    const receiver = await prisma.user.findUnique({
        where: { id: receiverId }
    });

    if (!receiver) return { error: 'Receiver not found.' };

    try {
        await prisma.transaction.create({
            data: {
                amount,
                requesterId: sender.id,
                approverId: receiverId,
                paymentMethod,
                status: 'PENDING',
                description: `Sent to ${receiver.name} (via ${paymentMethod})`,
                note: note || null,
            },
        });
    } catch (error) {
        console.error(error);
        return { error: 'Database Error: Failed to Create Request.' };
    }

    revalidatePath('/dashboard');
    return { success: 'Request processed successfully.' };
}



export async function addMoneyByAdmin(prevState: unknown, formData: FormData): Promise<{ success?: string; error?: string }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const adminUser = await prisma.user.findUnique({
        where: { email: session.user.email }
    });

    if (!adminUser || !adminUser.isAdmin) {
        return { error: "Unauthorized: Admin access required." };
    }

    const validated = AdminAddMoneySchema.safeParse({
        userId: formData.get('userId'),
        amount: formData.get('amount'),
        paymentMethod: formData.get('paymentMethod'),
        note: formData.get('note'),
    });

    if (!validated.success) return { error: "Invalid input data." };

    const { userId, amount, paymentMethod, note } = validated.data;

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return { error: "User not found." };

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Create APPROVED Transaction
            const isSelf = userId === adminUser.id;
            const description = isSelf
                ? `Added by Self (Admin)`
                : `Added to ${targetUser.name} by ${adminUser.name} (Admin)`;

            await tx.transaction.create({
                data: {
                    amount: amount,
                    requesterId: userId, // The user receiving money
                    approverId: adminUser.id, // The admin adding it
                    status: 'APPROVED',
                    paymentMethod: paymentMethod || 'CASH',
                    description: description,
                    note: note || null,
                }
            });

            // 2. Update User Balance
            await tx.user.update({
                where: { id: userId },
                data: { balance: { increment: amount } }
            });
        });
    } catch (error) {
        console.error("Admin Add Money Error:", error);
        return { error: "Database Error: Failed to add money." };
    }

    revalidatePath('/dashboard');
    await syncUserStatus(userId);
    return { success: "Money added successfully!" };
}


export async function getUsers() {
    const session = await auth();
    if (!session?.user?.email) return [];
    return await prisma.user.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
}

export async function approveRequest(formData: FormData): Promise<{ success?: string; error?: string }> {
    const session = await auth(); // Need to verify user is the approver
    if (!session?.user?.email) return { error: "Not authenticated" };

    const id = formData.get('id') as string;

    // Find transaction
    const tx = await prisma.transaction.findUnique({
        where: { id },
        include: { requester: true, approver: true }
    });

    if (!tx || tx.status !== 'PENDING') return { error: "Invalid request or already processed." };

    // Verify current user is the approver
    if (tx.approver.email !== session.user.email) return { error: 'Unauthorized.' };

    try {
        await prisma.$transaction([
            prisma.transaction.update({
                where: { id },
                data: { status: 'APPROVED' }
            }),
            prisma.user.update({
                where: { id: tx.requesterId },
                data: { balance: { increment: tx.amount } }
            })
        ]);
    } catch (e) {
        console.error("Failed to approve transaction", e);
        return { error: "Database Error: Approval failed." };
    }

    revalidatePath('/dashboard');
    await syncUserStatus(tx.requesterId);
    return { success: "Request approved!" };
}

export async function declineRequest(formData: FormData): Promise<{ success?: string; error?: string }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const id = formData.get('id') as string;

    const tx = await prisma.transaction.findUnique({ where: { id }, include: { approver: true } });
    if (!tx || tx.status !== 'PENDING' || tx.approver.email !== session.user.email) return { error: "Invalid request or unauthorized." };

    try {
        await prisma.transaction.update({
            where: { id },
            data: { status: 'DECLINED' }
        });
    } catch (e) {
        console.error(e);
        return { error: "Database Error: Declining failed." };
    }

    revalidatePath('/dashboard');
    return { success: "Request declined." };
}
