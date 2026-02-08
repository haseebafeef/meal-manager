import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getAllUsers } from '@/app/lib/admin-actions';
import { UserIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import UserDropdown from '@/app/ui/user-dropdown';
import Link from 'next/link';
import UserRowActions from './user-row-actions';
import UserTagEditor from './user-tag-editor';

import { prisma } from '@/app/lib/prisma';

export default async function AdminUsersPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/login');

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser || !currentUser.isAdmin) redirect('/dashboard');

    // This check is also inside getAllUsers, but good for page protection
    const users = await getAllUsers();

    if (!users) {
        // If null, it means not authorized or error
        redirect('/dashboard');
    }

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-4 md:p-6 text-sm">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Admin Management</h1>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Link href="/dashboard/admin" className="btn-secondary">Back to Admin</Link>
                    <UserDropdown user={currentUser} />
                </div>
            </div>

            <div className="card-panel overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm whitespace-nowrap">
                        <thead className="uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 font-medium text-gray-500 dark:text-gray-400">
                            <tr>
                                <th scope="col" className="px-4 py-3">User</th>
                                <th scope="col" className="px-4 py-3">Email</th>
                                <th scope="col" className="px-4 py-3">Balance</th>
                                <th scope="col" className="px-4 py-3">Role</th>
                                <th scope="col" className="px-4 py-3">Tag</th>
                                <th scope="col" className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            {user.image ? (
                                                <Image
                                                    src={user.image}
                                                    alt={user.name}
                                                    width={32}
                                                    height={32}
                                                    className="rounded-full object-cover"
                                                    sizes="32px"
                                                />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                                    <UserIcon className="w-4 h-4 text-gray-500" />
                                                </div>
                                            )}
                                            <span className="font-medium text-gray-900 dark:text-white">{user.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">{user.email || '-'}</td>
                                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">৳{user.balance.toFixed(2)}</td>
                                    <td className="px-4 py-3">
                                        {user.isAdmin ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                                <ShieldCheckIcon className="w-3 h-3" /> Admin
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                                User
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <UserTagEditor userId={user.id} initialTag={user.tag} />
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <UserRowActions user={user} isSelf={user.id === currentUser.id} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}


