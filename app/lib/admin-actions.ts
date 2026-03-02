'use server';

import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getBatchUserSummaries } from '@/app/services/expenses/summary';

export async function toggleAdminStatus(userId: string, currentStatus: boolean): Promise<{ success?: string; error?: string }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const currentUser = await prisma.user.findUnique({
        where: { email: session.user.email }
    });

    if (!currentUser || !currentUser.isAdmin) {
        return { error: "Unauthorized: Admin access required." };
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { isAdmin: !currentStatus }
        });
        revalidatePath('/dashboard/admin/users');
        return { success: `User status updated to ${!currentStatus ? 'Admin' : 'User'}` };
    } catch (error) {
        console.error("Toggle Admin Error:", error);
        return { error: "Database error" };
    }
}

export async function toggleUserStatus(userId: string, currentStatus: string): Promise<{ success?: string; error?: string }> {
    const session = await auth();
    if (!session?.user?.email) return { error: "Not authenticated" };

    const currentUser = await prisma.user.findUnique({
        where: { email: session.user.email }
    });

    if (!currentUser || !currentUser.isAdmin) {
        return { error: "Unauthorized: Admin access required." };
    }

    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';

    try {
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
        return { success: `User status updated to ${newStatus}` };
    } catch (error) {
        console.error("Toggle Status Error:", error);
        return { error: "Database error" };
    }
}

export async function getAllUsers() {
    const session = await auth();
    if (!session?.user?.email) return null;

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser?.isAdmin) return null;

    const users = await prisma.user.findMany({
        orderBy: { name: 'asc' },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            isAdmin: true,
            status: true,
            balance: true,
            tag: true
        }
    });

    // Optimized: Calculate Net Balance for all users in parallel
    const userBalances = await getBatchUserSummaries();

    const usersWithNetBalance = users.map((user) => {
        const summary = userBalances.get(user.id);
        return {
            ...user,
            balance: summary ? summary.remainingBalance : user.balance // Use calculated net balance
        };
    });

    return usersWithNetBalance;
}
