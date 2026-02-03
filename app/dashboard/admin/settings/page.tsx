import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import UserDropdown from '@/app/ui/user-dropdown';
import Link from 'next/link';
import SettingsContent from './settings-content';

import { prisma } from '@/app/lib/prisma';

export default async function AdminSettingsPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/login');

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser || !currentUser.isAdmin) redirect('/dashboard');

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-4 md:p-6 transition-colors duration-300">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Admin Settings</h1>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Link href="/dashboard/admin" className="btn-secondary">Back to Admin</Link>
                    <UserDropdown user={currentUser} />
                </div>
            </div>

            <SettingsContent />
        </main>
    );
}

