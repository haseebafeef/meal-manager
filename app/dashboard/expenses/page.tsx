import { getMonthlyExpenses, getAvailableExpenseMonths } from '@/app/lib/expense-actions';
import MonthSelector from '@/app/ui/month-selector';
import Image from 'next/image';
import { format } from 'date-fns';
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

                    <div className="flex items-center gap-3">
                        <Link href="/dashboard" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-zinc-800 dark:text-gray-300 dark:border-zinc-700 dark:hover:bg-zinc-700 transition-colors">
                            Dashboard
                        </Link>
                        <ThemeToggle />
                        <UserDropdown user={currentUser} />
                    </div>
                </div>

                {/* Controls & Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-1 flex items-center">
                        <MonthSelector months={months} />
                    </div>

                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg p-6 text-white flex items-center justify-between">
                        <div>
                            <p className="text-blue-100 text-sm font-medium">Total Spent</p>
                            <h2 className="text-3xl font-bold mt-1">৳ {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</h2>
                        </div>
                        <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
                            <BanknotesIcon className="w-8 h-8 text-white" />
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
                    {expenses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="p-4 bg-gray-100 dark:bg-zinc-800/50 rounded-full mb-4">
                                <DocumentTextIcon className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">No expenses found</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                No records available for {currentMonthStr}.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Mobile View (Cards) */}
                            <div className="md:hidden divide-y divide-gray-100 dark:divide-zinc-800">
                                {expenses.map((expense) => (
                                    <div key={expense.id} className="p-4 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                {expense.purchaserImage ? (
                                                    <Image
                                                        src={expense.purchaserImage}
                                                        className="rounded-full ring-2 ring-white dark:ring-zinc-800"
                                                        width={36}
                                                        height={36}
                                                        alt={expense.purchaserName}
                                                    />
                                                ) : (
                                                    <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold ring-2 ring-white dark:ring-zinc-800">
                                                        {expense.purchaserName[0]}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">{expense.description}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                        {format(new Date(expense.date), 'MMM d, h:mm a')}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="text-lg font-bold text-gray-900 dark:text-white">৳{expense.amount}</p>
                                        </div>

                                        <div className="flex items-center justify-between text-sm pt-2">
                                            <div className="text-gray-500 dark:text-gray-400">
                                                {expense.volume && (
                                                    <span className="bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded-md text-xs">
                                                        {expense.volume} {expense.unitPrice ? `@ ${expense.unitPrice}` : ''}
                                                    </span>
                                                )}
                                            </div>
                                            {expense.imagePath && (
                                                <a href={expense.imagePath} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs hover:underline">
                                                    <PhotoIcon className="w-4 h-4" />
                                                    Memo
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop View (Table) */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                                    <thead className="bg-gray-50 dark:bg-zinc-800/50 text-gray-700 dark:text-gray-300 uppercase text-xs tracking-wider">
                                        <tr>
                                            <th scope="col" className="px-6 py-4 font-semibold">Date</th>
                                            <th scope="col" className="px-6 py-4 font-semibold">Item / Description</th>
                                            <th scope="col" className="px-3 py-4 font-semibold">Vol</th>
                                            <th scope="col" className="px-3 py-4 font-semibold text-center">Unit</th>
                                            <th scope="col" className="px-3 py-4 font-semibold text-right">Rate / Unit</th>
                                            <th scope="col" className="px-6 py-4 font-semibold text-right">Total</th>
                                            <th scope="col" className="px-6 py-4 font-semibold">Purchaser</th>
                                            <th scope="col" className="px-6 py-4 font-semibold text-center">Memo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-zinc-800">
                                        {expenses.map((expense) => (
                                            <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                                                        <span className="font-medium text-gray-900 dark:text-white">
                                                            {format(new Date(expense.date), 'MMM d, yyyy')}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 pl-6">
                                                        {format(new Date(expense.date), 'h:mm a')}
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
                                                    <div className="flex items-center gap-3">
                                                        {expense.purchaserImage ? (
                                                            <Image
                                                                src={expense.purchaserImage}
                                                                className="rounded-full ring-2 ring-white dark:ring-zinc-800"
                                                                width={32}
                                                                height={32}
                                                                alt={expense.purchaserName}
                                                            />
                                                        ) : (
                                                            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold ring-2 ring-white dark:ring-zinc-800">
                                                                {expense.purchaserName[0]}
                                                            </div>
                                                        )}
                                                        <span className="font-medium text-gray-700 dark:text-gray-300">{expense.purchaserName}</span>
                                                    </div>
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
        </div>
    );
}
