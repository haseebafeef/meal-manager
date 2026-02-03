import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import clsx from 'clsx';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import UserDropdown from '@/app/ui/user-dropdown';
import Link from 'next/link';

import { prisma } from '@/app/lib/prisma';

import Pagination from '@/app/ui/pagination';

const ITEMS_PER_PAGE = 15;

export default async function HistoryPage(props: {
    searchParams?: Promise<{
        page?: string;
    }>;
}) {
    const searchParams = await props.searchParams;
    const currentPage = Number(searchParams?.page) || 1;
    const session = await auth();
    if (!session?.user) redirect('/login');

    // Verify User
    if (!session?.user?.email) redirect('/login');
    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser) redirect('/login');

    // Fetch all user balances (Public Ledger)
    const users = await prisma.user.findMany({
        select: { id: true, name: true, balance: true },
        orderBy: { name: 'asc' }
    });

    const whereCondition = {
        OR: [
            { requesterId: currentUser.id },
            { approverId: currentUser.id },
        ]
    };

    // 1. Get Total Count for Pagination
    const totalItems = await prisma.transaction.count({
        where: whereCondition
    });
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    // 2. Get Paginated Data
    const transactions = await prisma.transaction.findMany({
        where: whereCondition,
        include: {
            requester: { select: { name: true } },
            approver: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE,
    });


    return (
        <main className="flex min-h-screen flex-col p-4 md:p-6 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 transition-colors">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Global History & Balances</h1>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Link href="/dashboard" className="btn-secondary">Back to Dashboard</Link>
                    <UserDropdown user={currentUser} />
                </div>
            </div>

            {/* Current User Balances Section */}
            <div className="mb-8 rounded-xl border bg-white dark:bg-zinc-800 p-6 shadow-sm overflow-x-auto border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                    {currentUser.isAdmin ? "Current User Balances" : "Current User Balance"}
                </h2>
                <table className="min-w-full text-gray-900 dark:text-gray-100">
                    <thead className="rounded-lg text-left text-sm font-normal">
                        <tr>
                            <th scope="col" className="px-4 py-3 font-medium sm:pl-6 text-gray-500 dark:text-gray-400">User</th>
                            <th scope="col" className="px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Balance</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-zinc-800 divide-y divide-gray-100 dark:divide-gray-700">
                        {(currentUser.isAdmin ? users : users.filter(u => u.id === currentUser.id)).map((u) => (
                            <tr key={u.id} className="w-full py-3 text-sm hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors">
                                <td className="whitespace-nowrap py-3 pl-6 pr-3 font-medium">{u.name}</td>
                                <td className={clsx(
                                    "whitespace-nowrap px-3 py-3 font-bold",
                                    (u.balance || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                )}>
                                    {u.balance ?? 0} tk
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Global Transactions Section */}
            <div className="rounded-xl border bg-white dark:bg-zinc-800 p-6 shadow-sm overflow-x-auto border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">All Transactions</h2>
                <table className="min-w-full text-gray-900 dark:text-gray-100">
                    <thead className="rounded-lg text-left text-sm font-normal">
                        <tr>
                            <th scope="col" className="px-4 py-3 font-medium sm:pl-6 text-gray-500 dark:text-gray-400">Sender</th>
                            <th scope="col" className="px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Description</th>
                            <th scope="col" className="px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                            <th scope="col" className="px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Time</th>
                            <th scope="col" className="px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Receiver</th>
                            <th scope="col" className="px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-zinc-800 divide-y divide-gray-100 dark:divide-gray-700">
                        {transactions.map((tx) => {
                            const isApprover = tx.approverId === currentUser.id;
                            const isRequester = tx.requesterId === currentUser.id;
                            const isAdminAdd = tx.description?.includes('(Admin)');

                            let mainText = "";
                            let subText = "";
                            const method = tx.paymentMethod || "Cash";

                            if (isApprover) {
                                if (isAdminAdd) {
                                    if (tx.description && (tx.description.startsWith("Added to") || tx.description.startsWith("Added by Self"))) {
                                        mainText = tx.description;
                                    } else {
                                        mainText = `Added to ${tx.requester.name} by ${tx.approver.name} (Admin)`;
                                    }
                                    subText = `${method} payment`;
                                } else {
                                    if (isRequester) {
                                        mainText = "Added by Self";
                                    } else {
                                        mainText = `Received from ${tx.requester.name}`;
                                    }
                                    subText = `via ${method}`;
                                }
                            } else {
                                // User is Requester
                                if (isAdminAdd) {
                                    mainText = tx.description || "Admin Transaction";
                                    subText = `${method} Payment`;
                                } else {
                                    let desc = tx.description || "";
                                    if (desc.includes(' (via ')) desc = desc.split(' (via ')[0];

                                    if (desc.startsWith("Sent to")) {
                                        mainText = desc;
                                    } else {
                                        mainText = `Sent to ${tx.approver.name}`;
                                    }
                                    subText = `via ${method}`;
                                }
                            }

                            return (
                                <tr key={tx.id} className="w-full py-3 text-sm hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors">
                                    <td className="whitespace-nowrap py-3 pl-6 pr-3 font-medium text-gray-900 dark:text-gray-100">{tx.requester.name}</td>
                                    <td className="px-3 py-3 max-w-xs">
                                        <div className="flex flex-col">
                                            <span className="text-gray-900 dark:text-gray-100 font-medium truncate">
                                                {mainText}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {subText}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-gray-900 dark:text-gray-100">৳{tx.amount.toFixed(2)}</td>
                                    <td className="whitespace-nowrap px-3 py-3 text-gray-500 dark:text-gray-400">{tx.createdAt.toLocaleDateString()} {tx.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="whitespace-nowrap px-3 py-3 font-medium text-gray-900 dark:text-gray-100">{tx.approver.name}</td>
                                    <td className="whitespace-nowrap px-3 py-3">
                                        <span className={clsx(
                                            'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
                                            {
                                                'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300': tx.status === 'PENDING',
                                                'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': tx.status === 'APPROVED',
                                                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': tx.status === 'DECLINED',
                                            }
                                        )}>
                                            {tx.status}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {transactions.length === 0 && (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">No transactions found.</p>
                )}
            </div>

            <Pagination totalPages={totalPages} />
        </main>
    );
}
