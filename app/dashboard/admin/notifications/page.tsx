import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import Link from 'next/link';
import NotificationPermissionList from '@/app/ui/notification-permission-list';

export default async function AdminNotificationsPage() {
    const session = await auth();
    const currentUser = await prisma.user.findUnique({ where: { email: session?.user?.email || '' } });

    if (!currentUser || !currentUser.isAdmin) {
        redirect('/dashboard');
    }

    // Fetch all users
    const users = await prisma.user.findMany({
        orderBy: { name: 'asc' },
        include: { pushSubscriptions: true }
    });

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-4 md:p-6 transition-colors duration-300">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Notification Settings</h1>
                    <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
                        <ThemeToggle />
                        <Link href="/dashboard/admin" className="btn-secondary">Back to Admin</Link>
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                        <h2 className="text-lg font-semibold">User Notification Access</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Select which users are eligible to receive the daily meal report.
                            Users selected here will see an &quot;Enable Notifications&quot; button in their profile.
                        </p>
                    </div>

                    <NotificationPermissionList users={users} />
                </div>
            </div>
        </main>
    );
}
