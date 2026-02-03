import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import MealCalendar from '@/app/ui/meal-calendar';
import { getMealStatus } from '@/app/lib/meal-actions';
import { ThemeToggle } from '@/app/ui/theme-toggle';


import { prisma } from '@/app/lib/prisma';

export default async function AdminManageUserMealsPage({ params }: { params: Promise<{ userId: string }> }) {
    const session = await auth();
    // Re-verify admin status for security
    const currentUser = await prisma.user.findUnique({ where: { email: session?.user?.email || '' } });
    if (!currentUser || !currentUser.isAdmin) redirect('/dashboard');

    const { userId } = await params;

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return <p>User not found.</p>;

    const statuses = await getMealStatus(userId);

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-4 md:p-6 transition-colors duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Manage Meals: <span className="text-blue-600 dark:text-blue-400">{targetUser.name}</span></h1>
                    <p className="text-sm text-gray-500">Admin Mode: Cutoff times do not apply.</p>
                </div>
                <div className="flex gap-2">
                    <ThemeToggle />
                    <a href="/dashboard/admin/users" className="btn-secondary">Back to Users</a>
                </div>
            </div>

            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm p-4 md:p-6 max-w-4xl mx-auto w-full border border-gray-100 dark:border-gray-700">
                <MealCalendar initialStatuses={statuses} targetUserId={userId} adminOverride={true} />
            </div>
        </main>
    );
}
