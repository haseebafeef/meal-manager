import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import UserDropdown from '@/app/ui/user-dropdown';
import Link from 'next/link';
import { UserGroupIcon, Cog6ToothIcon, CurrencyBangladeshiIcon } from '@heroicons/react/24/outline';

import { prisma } from '@/app/lib/prisma';

export default async function AdminHubPage() {
    const session = await auth();
    console.log('Admin Page Session:', session?.user?.email);

    // Verify admin
    const currentUser = await prisma.user.findUnique({ where: { email: session?.user?.email || '' } });
    console.log('Admin Page User:', currentUser?.name, 'IsAdmin:', currentUser?.isAdmin);

    if (!currentUser || !currentUser.isAdmin) {
        console.log('Redirecting to dashboard...');
        redirect('/dashboard');
    }

    const links = [
        {
            href: '/dashboard/admin/users',
            title: 'Manage Users',
            description: 'View user list, toggle admin roles, and manage individual user meals.',
            icon: UserGroupIcon,
            color: 'text-purple-600 dark:text-purple-400',
            bg: 'bg-purple-100 dark:bg-purple-900/20'
        },
        {
            href: '/dashboard/admin/settings',
            title: 'System Settings',
            description: 'Configure lunch/dinner cutoff times and default meal rates.',
            icon: Cog6ToothIcon,
            color: 'text-blue-600 dark:text-blue-400',
            bg: 'bg-blue-100 dark:bg-blue-900/20'
        },
        {
            href: '/dashboard/admin/history',
            title: 'Global System History',
            description: 'View all transactions across the system by month.',
            icon: CurrencyBangladeshiIcon,
            color: 'text-green-600 dark:text-green-400',
            bg: 'bg-green-100 dark:bg-green-900/20'
        },
    ];

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-4 md:p-6 transition-colors duration-300">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Admin Management</h1>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Link href="/dashboard" className="btn-secondary">Back to Dashboard</Link>
                    <UserDropdown user={currentUser} />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
                {links.map((link) => (
                    <Link
                        key={link.title}
                        href={link.href}
                        className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow flex flex-col gap-3 group"
                    >
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${link.bg}`}>
                            <link.icon className={`w-6 h-6 ${link.color}`} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {link.title}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {link.description}
                            </p>
                        </div>
                    </Link>
                ))}
            </div>
        </main>
    );
}
