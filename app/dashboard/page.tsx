import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AddBalanceForm from '@/app/ui/add-balance-form';
import TransactionsList from '@/app/ui/transactions-list';
import AddExpensesTable from '@/app/ui/add-expenses-table';
import AdminAddMoneyForm from '@/app/ui/admin-add-money-form';
import ExpenseList from '@/app/ui/expense-list';
import { getSystemSummary, getUserSummary } from '@/app/lib/expense-actions';
import { getDailyMealStats } from '@/app/lib/meal-actions';

import { prisma } from '@/app/lib/prisma';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import UserDropdown from '@/app/ui/user-dropdown';

// Removed local instantiation
// const prisma = new PrismaClient();

export default async function Dashboard() {
    const session = await auth();

    if (!session?.user?.email) {
        redirect('/login');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;
    const userEmail = session.user.email;

    let currentUser;

    if (userId) {
        currentUser = await prisma.user.findUnique({ where: { id: userId } });
    } else if (userEmail) {
        currentUser = await prisma.user.findFirst({ where: { email: userEmail } });
    }

    if (!currentUser) {
        console.error(`[Dashboard] Session/DB Mismatch: User ${userEmail} (${userId}) not found in database. Redirecting to login.`);
        redirect('/login');
    }

    // Parallel Data Fetching
    console.time('dashboard-parallel-fetch');
    const [summary, userSummary, pendingRequestsCount, mealStats] = await Promise.all([
        getSystemSummary(),
        getUserSummary(currentUser.id),
        prisma.transaction.count({
            where: {
                approverId: currentUser.id,
                status: 'PENDING'
            }
        }),
        getDailyMealStats()
    ]);
    console.timeEnd('dashboard-parallel-fetch');

    // 1. Users List (Background / Non-blocking for summary but needed for UI? Actually used in Admin Form below)
    // We can include this in the Promise.all or leave separate if not critical path for top fold.
    // Ideally put it in the Promise.all too.
    const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true }
    });


    return (
        <main className="text-gray-900 dark:text-gray-100 p-4 md:p-6 pb-64 transition-colors duration-300 pointer-events-none">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4 border-b border-gray-200 dark:border-gray-800 pb-6 pointer-events-auto w-full">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm md:text-base">
                        Welcome back, <span className="font-semibold text-gray-900 dark:text-white">{currentUser?.name}</span>
                    </p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        Your Balance: <span className={`font-bold text-lg ${userSummary.remainingBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>৳{userSummary.remainingBalance.toFixed(2)}</span>
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap w-full md:w-auto">
                    <ThemeToggle />
                    <Link href="/dashboard/history" className="btn-secondary flex-1 md:flex-none text-center justify-center">History</Link>
                    <Link href="/dashboard/meals" className="btn-secondary flex-1 md:flex-none text-center justify-center">Meals</Link>
                    <Link href="/dashboard/requests" className="relative btn-secondary bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 flex-1 md:flex-none text-center justify-center">
                        Requests
                        {pendingRequestsCount > 0 && (
                            <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-600 rounded-full ring-2 ring-white dark:ring-zinc-900">
                                {pendingRequestsCount}
                            </span>
                        )}
                    </Link>

                    {/* User Profile Dropdown */}
                    <div className="ml-0 md:ml-2">
                        <UserDropdown user={{
                            name: currentUser.name,
                            image: currentUser.image,
                            email: currentUser.email,
                            isAdmin: currentUser.isAdmin
                        }} />
                    </div>
                </div>
            </div >

            {/* Daily Meal Status */}
            < div className="mb-8 p-6 rounded-xl bg-white/80 dark:bg-black/60 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-sm pointer-events-auto" >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Today&apos;s Meal Overview</h2>
                    <a href={`/dashboard/meals/history`} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 hover:underline">
                        View History
                    </a>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Lunch */}
                    <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-semibold text-orange-800 dark:text-orange-400">Lunch</h3>
                            <span className="bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 text-xs font-bold px-2 py-1 rounded-full">
                                {mealStats.lunch.count} Meals
                            </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {mealStats.lunch.count > 0 ? mealStats.lunch.users.join(', ') : 'No meals booked.'}
                        </p>
                    </div>
                    {/* Dinner */}
                    <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/20">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-semibold text-indigo-800 dark:text-indigo-400">Dinner</h3>
                            <span className="bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 text-xs font-bold px-2 py-1 rounded-full">
                                {mealStats.dinner.count} Meals
                            </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {mealStats.dinner.count > 0 ? mealStats.dinner.users.join(', ') : 'No meals booked.'}
                        </p>
                    </div>
                </div>
            </div >

            {/* User Personal Summary */}
            < div className="mb-8 p-4 md:p-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-900/30 shadow-sm pointer-events-auto" >
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">My Summary (This Month)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6">
                    <SummaryCard title="Prev. Month Balance" amount={userSummary.previousMonthBalance} color="gray" />
                    <SummaryCard title="Total Credit" amount={userSummary.currentMonthCredit} color="blue" />
                    <SummaryCard title="Total Meals (Passed)" amount={userSummary.passedMealCount} color="purple" prefix="" />
                    <SummaryCard title="Used (Est. Costs)" amount={userSummary.currentMonthUsed} color="orange" />
                    <SummaryCard title="My Remaining Balance" amount={userSummary.remainingBalance} color={userSummary.remainingBalance >= 0 ? 'green' : 'red'} />
                </div>
            </div >

            {/* Summary Grid (System) */}
            < div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-8 pointer-events-auto" >
                <SummaryCard title="Prev. Month Balance" amount={summary.previousMonthBalance} color="gray" />
                <SummaryCard title="Total Credit (This Month)" amount={summary.currentMonthCredit} color="blue" />
                <SummaryCard title="Expenses (This Month)" amount={summary.currentMonthExpenses} color="red" />
                <SummaryCard title="Remaining Fund" amount={summary.remainingFund} color={summary.remainingFund >= 0 ? 'green' : 'red'} />
            </div >

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Actions */}
                <div className="lg:col-span-5 space-y-8 pointer-events-auto">
                    {/* Admin Section */}
                    {currentUser.isAdmin && (
                        <div className="card-panel border-purple-200 dark:border-purple-900/30 bg-purple-50 dark:bg-purple-900/10">
                            <h2 className="text-xl font-bold mb-4 text-purple-900 dark:text-purple-100">Admin: Add Money</h2>
                            <AdminAddMoneyForm users={users} />
                        </div>
                    )}

                    {/* Add Balance */}
                    <div className="card-panel">
                        <h2 className="text-xl font-bold mb-4">Add Balance Request</h2>
                        <AddBalanceForm users={users} />
                    </div>
                </div>

                {/* Right Column: Expenses */}
                <div className="lg:col-span-7 space-y-8 pointer-events-auto">
                    {/* Add Expenses */}
                    <div className="card-panel">
                        <AddExpensesTable />
                    </div>

                    {/* Recent Expenses List */}
                    <div className="card-panel">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Recent Expenses</h2>
                            <a href="/dashboard/expenses" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View All by Month</a>
                        </div>
                        <ExpenseList />
                    </div>
                </div>
            </div>

            <div className="mt-8 pointer-events-auto">
                <div className="card-panel">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">Recent Transactions</h2>
                        <a href="/dashboard/history" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Show All</a>
                    </div>
                    <TransactionsList />
                </div>
            </div>
        </main >
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
        <div className="bg-white/80 dark:bg-black/60 backdrop-blur-md p-4 md:p-6 rounded-xl shadow-sm border border-white/20 dark:border-white/10">
            <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className={`text-lg md:text-2xl font-bold mt-1 md:mt-2 ${colorClasses[color] || colorClasses.gray}`}>
                {prefix}{amount.toFixed(prefix === '৳' ? 2 : 0)}
            </p>
        </div>
    );
}
