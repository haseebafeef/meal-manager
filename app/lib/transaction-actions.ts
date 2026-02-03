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
});

const AdminAddMoneySchema = z.object({
    userId: z.string(),
    amount: z.coerce.number().refine((val) => val !== 0, "Amount cannot be zero"),
    paymentMethod: z.string().optional(),
});

export async function createBalanceRequest(prevState: { message: string } | undefined, formData: FormData) {
    const session = await auth();
    if (!session?.user?.email) {
        return { message: "You must be logged in." };
    }

    // Get current user ID from DB to be safe
    const sender = await prisma.user.findUnique({
        where: { email: session.user.email }
    });

    if (!sender) return { message: "User not found." };
    if (sender.status !== 'Active') return { message: "Your account is inactive." };

    const validatedFields = TransactionSchema.safeParse({
        amount: formData.get('amount'),
        receiverId: formData.get('receiverId'),
        paymentMethod: formData.get('paymentMethod'),
    });

    if (!validatedFields.success) {
        return { message: 'Invalid input. Please check all fields.' };
    }

    const { amount, receiverId, paymentMethod } = validatedFields.data;

    // Fetch receiver to name them in description
    const receiver = await prisma.user.findUnique({
        where: { id: receiverId }
    });

    if (!receiver) return { message: 'Receiver not found.' };

    try {
        await prisma.transaction.create({
            data: {
                amount,
                requesterId: sender.id,
                approverId: receiverId,
                paymentMethod,
                status: 'PENDING',
                description: `Sent to ${receiver.name} (via ${paymentMethod})`
            },
        });
    } catch (error) {
        console.error(error);
        return { message: 'Database Error: Failed to Create Request.' };
    }

    revalidatePath('/dashboard');
    return { message: 'Request processed successfully.' };
}



export async function addMoneyByAdmin(prevState: string | undefined, formData: FormData) {
    const session = await auth();
    if (!session?.user?.email) return "Not authenticated";

    const adminUser = await prisma.user.findUnique({
        where: { email: session.user.email }
    });

    if (!adminUser || !adminUser.isAdmin) {
        return "Unauthorized: Admin access required.";
    }

    const validated = AdminAddMoneySchema.safeParse({
        userId: formData.get('userId'),
        amount: formData.get('amount'),
        paymentMethod: formData.get('paymentMethod'),
    });

    if (!validated.success) return "Invalid input data.";

    const { userId, amount, paymentMethod } = validated.data;

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return "User not found.";

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
                    description: description
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
        return "Database Error: Failed to add money.";
    }

    revalidatePath('/dashboard');
    await syncUserStatus(userId);
    return "Money added successfully!";
}


export async function getUsers() {
    return await prisma.user.findMany({
        select: { id: true, name: true, email: true }
    });
}

export async function approveRequest(formData: FormData) {
    const session = await auth(); // Need to verify user is the approver
    if (!session?.user?.email) return;

    const id = formData.get('id') as string;

    // Find transaction
    const tx = await prisma.transaction.findUnique({
        where: { id },
        include: { requester: true, approver: true }
    });

    if (!tx || tx.status !== 'PENDING') return;

    // Verify current user is the approver
    if (tx.approver.email !== session.user.email) return;

    // Finalize the balance request by marking it approved and incrementing the user's balance.
    // The transaction and balance update are executed atomically.
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
        return { message: "Failed" };
    }

    revalidatePath('/dashboard');
    await syncUserStatus(tx.requesterId);
}

export async function declineRequest(formData: FormData) {
    const session = await auth();
    if (!session?.user?.email) return;

    const id = formData.get('id') as string;

    const tx = await prisma.transaction.findUnique({ where: { id }, include: { approver: true } });
    if (!tx || tx.status !== 'PENDING' || tx.approver.email !== session.user.email) return;

    await prisma.transaction.update({
        where: { id },
        data: { status: 'DECLINED' }
    });

    revalidatePath('/dashboard');
}
