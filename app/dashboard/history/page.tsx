import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import clsx from 'clsx';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import UserDropdown from '@/app/ui/user-dropdown';
import Link from 'next/link';

import { prisma } from '@/app/lib/prisma';
import { getBatchUserSummaries } from '@/app/services/expenses/summary';
import { getSelfMonthlyHistory } from '@/app/services/expenses/stats';

import Pagination from '@/app/ui/pagination';

const ITEMS_PER_PAGE = 15;
export const dynamic = 'force-dynamic';

export default async function HistoryPage(props: {
    searchParams?: Promise<{
        page?: string;
    }>;
}) {
    const searchParams = await props.searchParams;
    const currentPage = Number(searchParams?.page) || 1;
    const session = await auth();
    if (!session?.user) redirect('/login');

    if (!session?.user?.email) redirect('/login');
    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser) redirect('/login');

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

    const totalItems = await prisma.transaction.count({ where: whereCondition });
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

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

    const userSummaries = await getBatchUserSummaries();
    const selfHistory = await getSelfMonthlyHistory(currentUser.id);

    // Current month key for highlighting
    const nowDhaka = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
    const currentMonthKey = `${nowDhaka.getFullYear()}-${String(nowDhaka.getMonth() + 1).padStart(2, '0')}`;

    return (
        <main className="flex min-h-screen flex-col p-4 md:p-6 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 transition-colors">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold">Global History &amp; Balances</h1>
                <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
                    <ThemeToggle />
                    <Link href="/dashboard" className="btn-secondary flex-1 md:flex-none text-center">Dashboard</Link>
                    <UserDropdown user={currentUser} />
                </div>
            </div>

            {/* ── Self Monthly History ─────────────────────────────── */}
            <div className="mb-8 card-panel overflow-x-auto">
                <h2 className="text-xl font-bold mb-1 text-gray-900 dark:text-gray-100">My Monthly Summary</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Your meal history by month — balance carried forward, credits deposited, meals eaten, and cost charged.
                </p>
                <table className="min-w-full text-sm" style={{ minWidth: '680px' }}>
                    <thead className="bg-gray-100 dark:bg-zinc-900 text-gray-500 dark:text-gray-400 text-xs">
                        <tr>
                            <th className="px-4 py-2.5 text-left rounded-l-md whitespace-nowrap">Month</th>
                            <th className="px-4 py-2.5 text-right whitespace-nowrap">Prev. Balance</th>
                            <th className="px-4 py-2.5 text-right whitespace-nowrap">Total Credit</th>
                            <th className="px-4 py-2.5 text-right whitespace-nowrap">Total Meals</th>
                            <th className="px-4 py-2.5 text-right whitespace-nowrap">Meal Rate</th>
                            <th className="px-4 py-2.5 text-right whitespace-nowrap">Total Cost</th>
                            <th className="px-4 py-2.5 text-right rounded-r-md whitespace-nowrap">Closing Balance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {selfHistory.map((row) => {
                            const isCurrent = row.monthKey === currentMonthKey;
                            return (
                                <tr
                                    key={row.monthKey}
                                    className={clsx(
                                        'hover:bg-gray-50/80 dark:hover:bg-zinc-700/30 transition-colors',
                                        isCurrent && 'bg-blue-50/50 dark:bg-blue-900/10'
                                    )}
                                >
                                    <td className="px-4 py-3 font-semibold whitespace-nowrap text-gray-900 dark:text-gray-100">
                                        {row.label}
                                        {isCurrent && (
                                            <span className="ml-2 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
                                                Current
                                            </span>
                                        )}
                                        {!isCurrent && (
                                            <span className={clsx(
                                                'ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                                                row.finalized
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                            )}>
                                                {row.finalized ? '✓' : '⏳'}
                                            </span>
                                        )}
                                    </td>
                                    <td className={clsx(
                                        'px-4 py-3 text-right font-medium whitespace-nowrap',
                                        row.prevBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                    )}>
                                        {row.prevBalance >= 0 ? '+' : ''}৳{row.prevBalance.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-medium whitespace-nowrap">
                                        {row.totalCredit > 0 ? `৳${row.totalCredit.toFixed(2)}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                        {row.totalMeals}
                                    </td>
                                    <td className="px-4 py-3 text-right text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                                        {row.mealRate > 0 ? `৳${row.mealRate.toFixed(2)}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400 font-medium whitespace-nowrap">
                                        ৳{row.totalCost.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold whitespace-nowrap text-gray-400 dark:text-gray-500">
                                        {isCurrent
                                            ? '—'
                                            : <span className={row.closingBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                                {row.closingBalance >= 0 ? '+' : ''}৳{row.closingBalance.toFixed(2)}
                                            </span>
                                        }
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ── Current Balances (admin only or self) ─────────────── */}
            <div className="mb-8 card-panel overflow-x-auto">
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
                    {currentUser.isAdmin ? 'Current Balances' : 'My Balance'}
                </h2>
                <table className="min-w-full text-gray-900 dark:text-gray-100">
                    <thead className="rounded-lg text-left text-sm font-normal">
                        <tr>
                            <th scope="col" className="px-4 py-3 label-compact sm:pl-6">User</th>
                            <th scope="col" className="px-3 py-3 label-compact">Net Balance</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white/50 dark:bg-zinc-800/40 divide-y divide-gray-100 dark:divide-gray-700/50">
                        {(currentUser.isAdmin ? users : users.filter(u => u.id === currentUser.id)).map((u) => {
                            const summary = userSummaries.get(u.id);
                            const netBalance = summary ? summary.remainingBalance : 0;
                            return (
                                <tr key={u.id} className="w-full py-3 text-sm hover:bg-gray-50/50 dark:hover:bg-zinc-700/30 transition-colors">
                                    <td className="whitespace-nowrap py-3 pl-6 pr-3 font-medium">{u.name}</td>
                                    <td className={clsx(
                                        'whitespace-nowrap px-3 py-3 font-bold',
                                        (netBalance || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                    )}>
                                        {netBalance.toFixed(2)} tk
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ── All Transactions ──────────────────────────────────── */}
            <div className="card-panel overflow-x-auto">
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">All Transactions</h2>
                <table className="min-w-full text-gray-900 dark:text-gray-100">
                    <thead className="rounded-lg text-left text-sm font-normal">
                        <tr>
                            <th scope="col" className="px-4 py-3 label-compact sm:pl-6">Sender</th>
                            <th scope="col" className="px-3 py-3 label-compact">Description</th>
                            <th scope="col" className="px-3 py-3 label-compact">Amount</th>
                            <th scope="col" className="px-3 py-3 label-compact">Time</th>
                            <th scope="col" className="px-3 py-3 label-compact">Receiver</th>
                            <th scope="col" className="px-3 py-3 label-compact">Note</th>
                            <th scope="col" className="px-3 py-3 label-compact">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white/50 dark:bg-zinc-800/40 divide-y divide-gray-100 dark:divide-gray-700/50">
                        {transactions.map((tx) => {
                            const isApprover = tx.approverId === currentUser.id;
                            const isRequester = tx.requesterId === currentUser.id;
                            const isAdminAdd = tx.description?.includes('(Admin)');
                            let mainText = '', subText = '';
                            const method = tx.paymentMethod || 'Cash';

                            if (isApprover) {
                                if (isAdminAdd) {
                                    mainText = (tx.description?.startsWith('Added to') || tx.description?.startsWith('Added by Self'))
                                        ? (tx.description ?? '')
                                        : `Added to ${tx.requester.name} by ${tx.approver.name} (Admin)`;
                                    subText = `${method} payment`;
                                } else {
                                    mainText = isRequester ? 'Added by Self' : `Received from ${tx.requester.name}`;
                                    subText = `via ${method}`;
                                }
                            } else {
                                if (isAdminAdd) {
                                    mainText = tx.description || 'Admin Transaction';
                                    subText = `${method} Payment`;
                                } else {
                                    let desc = tx.description || '';
                                    if (desc.includes(' (via ')) desc = desc.split(' (via ')[0];
                                    mainText = desc.startsWith('Sent to') ? desc : `Sent to ${tx.approver.name}`;
                                    subText = `via ${method}`;
                                }
                            }

                            return (
                                <tr key={tx.id} className="w-full py-3 text-sm hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors">
                                    <td className="whitespace-nowrap py-3 pl-6 pr-3 font-medium">{tx.requester.name}</td>
                                    <td className="px-3 py-3 max-w-xs">
                                        <div className="flex flex-col">
                                            <span className="font-medium truncate">{mainText}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{subText}</span>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3 font-semibold">৳{tx.amount.toFixed(2)}</td>
                                    <td className="whitespace-nowrap px-3 py-3 text-gray-500 dark:text-gray-400">
                                        {tx.createdAt.toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka' })}{' '}
                                        {tx.createdAt.toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3 font-medium">{tx.approver.name}</td>
                                    <td className="px-3 py-3 max-w-[150px] truncate text-gray-500 dark:text-gray-400 italic" title={tx.note || ''}>{tx.note || '—'}</td>
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
