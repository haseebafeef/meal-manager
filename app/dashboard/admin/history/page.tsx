import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import clsx from 'clsx';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import UserDropdown from '@/app/ui/user-dropdown';
import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from 'date-fns';
import { getMonthlySystemSummary } from '@/app/lib/expense-actions';
import Pagination from '@/app/ui/pagination';

import { prisma } from '@/app/lib/prisma';

export default async function AdminHistoryPage({
    searchParams,
}: {
    searchParams: Promise<{
        month?: string;
        year?: string;
        page?: string;
    }>;
}) {
    const session = await auth();
    if (!session?.user?.email) redirect('/login');

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser || !currentUser.isAdmin) redirect('/dashboard');

    const params = await searchParams;
    const now = new Date();

    // Parse Month/Year params
    let monthParam = params?.month ? parseInt(params.month) : now.getMonth() + 1;
    let yearParam = params?.year ? parseInt(params.year) : now.getFullYear();

    // Validate params
    if (isNaN(monthParam) || monthParam < 1 || monthParam > 12) monthParam = now.getMonth() + 1;
    if (isNaN(yearParam) || yearParam < 2000 || yearParam > 2100) yearParam = now.getFullYear();

    // Javascript Month is 0-indexed
    const currentMonthDate = new Date(yearParam, monthParam - 1, 1);

    // Calculate Date Range for Prisma
    const start = startOfMonth(currentMonthDate);
    const end = endOfMonth(currentMonthDate);

    // Pagination Params
    const page = params?.page ? parseInt(params.page) : 1;
    const ITEMS_PER_PAGE = 20;

    // Fetch Summary Logic
    const summary = await getMonthlySystemSummary(yearParam, monthParam);

    // Calculate Counts
    const totalTransactions = await prisma.transaction.count({
        where: {
            createdAt: {
                gte: start,
                lte: end
            }
        }
    });
    const totalPages = Math.ceil(totalTransactions / ITEMS_PER_PAGE);

    // Fetch transactions
    const transactions = await prisma.transaction.findMany({
        where: {
            createdAt: {
                gte: start,
                lte: end
            }
        },
        include: {
            requester: { select: { name: true } },
            approver: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE
    });

    // Navigation Logic
    const prevDate = subMonths(currentMonthDate, 1);
    const nextDate = addMonths(currentMonthDate, 1);

    // Min Date Check: Feb 1, 2026
    const minDate = new Date(2026, 1, 1);
    const isPrevDisabled = currentMonthDate <= minDate;

    const prevLink = isPrevDisabled ? '#' : `/dashboard/admin/history?month=${prevDate.getMonth() + 1}&year=${prevDate.getFullYear()}`;
    const nextLink = `/dashboard/admin/history?month=${nextDate.getMonth() + 1}&year=${nextDate.getFullYear()}`;

    // Unified description formatting for transactions across the system.
    // This provides a consistent view for administrators regardless of their involvement.
    const formatDescription = (tx: {
        approverId: string | null;
        requesterId: string | null;
        description: string | null;
        paymentMethod: string | null;
        requester: { name: string | null };
        approver: { name: string | null };
    }) => {
        const isApprover = tx.approverId === currentUser.id;
        const isRequester = tx.requesterId === currentUser.id;
        const isAdminAdd = tx.description?.includes('(Admin)');

        let mainText = "";
        let subText = "";
        const method = tx.paymentMethod || "Cash";

        // Determine description based on involvement and administrative context.
        if (tx.requesterId !== currentUser.id && tx.approverId !== currentUser.id) {
            // Context: Third-party transactions
            if (isAdminAdd) {
                mainText = tx.description || "Admin Transaction";
                subText = `${method} payment`;
            } else {
                mainText = `${tx.requester.name} sent to ${tx.approver.name}`;
                subText = `via ${method}`;
            }
        } else {
            // Context: Transactions involving the current administrator
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
                // Requester logic
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
        }

        return { mainText, subText };
    };

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-4 md:p-6 transition-colors">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Monthly Transactions (Admin)</h1>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Link href="/dashboard/admin" className="btn-secondary">Back to Admin Hub</Link>
                    <UserDropdown user={currentUser} />
                </div>
            </div>

            {/* Month Navigation */}
            <div className="flex justify-between items-center bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 max-w-sm mx-auto">
                <Link
                    href={prevLink}
                    className={clsx("p-2 rounded-full transition-colors", {
                        "hover:bg-gray-100 dark:hover:bg-zinc-700": !isPrevDisabled,
                        "opacity-30 cursor-not-allowed pointer-events-none": isPrevDisabled
                    })}
                >
                    <ChevronLeftIcon className="w-5 h-5" />
                </Link>
                <span className="font-bold text-lg">{format(currentMonthDate, 'MMMM yyyy')}</span>
                <Link href={nextLink} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-full transition-colors">
                    <ChevronRightIcon className="w-5 h-5" />
                </Link>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6 mb-8">
                <SummaryCard title="Prev. Month Balance" amount={summary.previousMonthBalance} color="gray" />
                <SummaryCard title="Total Credit (This Month)" amount={summary.currentMonthCredit} color="blue" />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <SummaryCard title="Total Meals" amount={(summary as any).totalMeals || 0} color="purple" prefix="" />
                <SummaryCard title="Expenses (This Month)" amount={summary.currentMonthExpenses} color="red" />
                <SummaryCard title="Remaining Fund" amount={summary.remainingFund} color={summary.remainingFund >= 0 ? 'green' : 'red'} />
            </div>

            {/* Transactions Table */}
            <div className="rounded-xl border bg-white dark:bg-zinc-800 p-6 shadow-sm overflow-x-auto border-gray-100 dark:border-gray-700">
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
                            const { mainText, subText } = formatDescription(tx);

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
                                    <td className="whitespace-nowrap px-3 py-3 text-gray-500 dark:text-gray-400">{format(tx.createdAt, 'dd/MM/yy hh:mm a')}</td>
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
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">No transactions found for this month.</p>
                )}
            </div>

            <Pagination totalPages={totalPages} />
        </main>
    );
}

function SummaryCard({ title, amount, color, prefix = '৳' }: { title: string, amount: number, color: string, prefix?: string }) {
    const colorClasses: Record<string, string> = {
        gray: 'text-gray-600 dark:text-gray-300',
        blue: 'text-blue-600 dark:text-blue-400',
        red: 'text-red-600 dark:text-red-400',
        green: 'text-green-600 dark:text-green-400',
        orange: 'text-orange-600 dark:text-orange-400',
        purple: 'text-purple-600 dark:text-purple-400',
    };

    return (
        <div className="bg-white dark:bg-zinc-800 p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className={`text-lg md:text-2xl font-bold mt-1 md:mt-2 ${colorClasses[color] || colorClasses.gray}`}>
                {prefix}{amount.toFixed(prefix === '৳' ? 2 : 0)}
            </p>
        </div>
    );
}

