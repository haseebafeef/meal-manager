import { getMonthlyExpenses } from '@/app/services/expenses/getMonthlyExpenses';
import { getAvailableExpenseMonths } from '@/app/services/expenses/getAvailableExpenseMonths';
import MonthSelector from '@/app/ui/month-selector';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import UserDropdown from '@/app/ui/user-dropdown';
import Link from 'next/link';
import {
    CalendarIcon,
    BanknotesIcon,
    DocumentTextIcon,
    PhotoIcon
} from '@heroicons/react/24/outline';



export default async function ExpensesPage(props: {
    searchParams?: Promise<{
        month?: string;
    }>;
}) {
    const session = await auth();
    if (!session?.user?.email) redirect('/login');

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser) redirect('/login');

    const searchParams = await props.searchParams;
    const currentMonthStr = searchParams?.month || new Date().toISOString().slice(0, 7); // YYYY-MM
    const [year, month] = currentMonthStr.split('-').map(Number); // Month is 1-indexed from split

    const { expenses, total } = await getMonthlyExpenses(year, month - 1); // JS Month is 0-indexed
    const months = await getAvailableExpenseMonths();

    // Ensure current month is in the list
    if (!months.includes(currentMonthStr)) {
        months.push(currentMonthStr);
        months.sort().reverse();
    }

    return (
        <div className="w-full min-h-screen bg-gray-50/50 dark:bg-black/50 p-4 md:p-8 transition-colors font-sans">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Monthly Expenses</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Track and manage hostel purchasing records.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap w-full md:w-auto justify-end">
                        <Link href="/dashboard" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-zinc-800 dark:text-gray-300 dark:border-zinc-700 dark:hover:bg-zinc-700 transition-colors">
                            Dashboard
                        </Link>
                        <ThemeToggle />
                        <UserDropdown user={currentUser} />
                    </div>
                </div>

                {/* Controls & Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 card-panel !p-1 flex items-center">
                        <MonthSelector months={months} />
                    </div>

                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-md p-5 text-white flex items-center justify-between">
                        <div>
                            <p className="text-blue-100/80 text-[10px] font-bold tracking-wider">Total Spent</p>
                            <h2 className="text-2xl md:text-3xl font-bold mt-0.5">৳ {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</h2>
                        </div>
                        <div className="p-2.5 bg-white/20 rounded-full backdrop-blur-sm">
                            <BanknotesIcon className="w-6 h-6 md:w-8 md:h-8 text-white" />
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="card-panel !p-0 overflow-hidden">
                    {expenses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="p-4 bg-gray-100 dark:bg-zinc-800/50 rounded-full mb-4">
                                <DocumentTextIcon className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-200">No expenses found</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                No records available for {currentMonthStr}.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Mobile View (Cards) */}
                            <div className="md:hidden divide-y divide-gray-100 dark:divide-zinc-800/50">
                                {expenses.map((expense) => (
                                    <div key={expense.id} className="p-4 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div>
                                                    <p className="font-bold text-gray-900 dark:text-white">{expense.description}</p>
                                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                        {new Date(expense.date).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: 'numeric', month: 'short' }) + ', ' + new Date(expense.date).toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka", hour: 'numeric', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="text-lg font-bold text-gray-900 dark:text-white">৳{expense.amount}</p>
                                        </div>

                                        <div className="flex items-center justify-between text-sm pt-2">
                                            <div className="text-gray-500 dark:text-gray-400">
                                                {expense.volume && (
                                                    <span className="bg-gray-100 dark:bg-zinc-800/50 px-2 py-0.5 rounded text-[10px] font-bold">
                                                        {expense.volume} {expense.unitPrice ? `@ ${expense.unitPrice}` : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-medium text-gray-400">by {expense.purchaserName}</span>
                                                {expense.imagePath && (
                                                    <a href={expense.imagePath} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 dark:text-blue-400 text-[10px] font-bold hover:underline">
                                                        <PhotoIcon className="w-3.5 h-3.5" />
                                                        Memo
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop View (Table) */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                                    <thead className="bg-gray-50/50 dark:bg-zinc-900/50">
                                        <tr>
                                            <th scope="col" className="px-6 py-4 label-compact">Date</th>
                                            <th scope="col" className="px-6 py-4 label-compact">Item / Description</th>
                                            <th scope="col" className="px-3 py-4 label-compact">Vol</th>
                                            <th scope="col" className="px-3 py-4 label-compact text-center">Unit</th>
                                            <th scope="col" className="px-3 py-4 label-compact text-right">Rate / Unit</th>
                                            <th scope="col" className="px-6 py-4 label-compact text-right">Total</th>
                                            <th scope="col" className="px-6 py-4 label-compact">Purchaser</th>
                                            <th scope="col" className="px-6 py-4 label-compact text-center">Memo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/50">
                                        {expenses.map((expense) => (
                                            <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                                                        <span className="font-medium text-gray-900 dark:text-white">
                                                            {new Date(expense.date).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 pl-6">
                                                        {new Date(expense.date).toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka", hour: 'numeric', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                                    {expense.description}
                                                </td>
                                                <td className="px-3 py-4 text-gray-600 dark:text-gray-400">
                                                    {expense.volume || '-'}
                                                </td>
                                                <td className="px-3 py-4 text-center font-mono text-gray-600 dark:text-gray-400">
                                                    {expense.unit || '-'}
                                                </td>
                                                <td className="px-3 py-4 text-right font-mono text-gray-600 dark:text-gray-400">
                                                    {expense.unitPrice ? `৳ ${expense.unitPrice}` : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                                                    ৳{expense.amount.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="font-medium text-gray-700 dark:text-gray-300">{expense.purchaserName}</span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {expense.imagePath ? (
                                                        <a
                                                            href={expense.imagePath}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded-full transition-colors tooltip"
                                                            title="View Memo"
                                                        >
                                                            <PhotoIcon className="w-5 h-5" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-gray-300 dark:text-zinc-600">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div >
    );
}
