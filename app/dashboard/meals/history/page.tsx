import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getMonthlyMealHistory } from '@/app/services/meals/history';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import clsx from 'clsx';
import { startOfMonth, addMonths, isBefore, isAfter, format, endOfMonth } from 'date-fns';
import { RAMADAN_CONFIG } from '@/app/lib/constants';

export default async function MealHistoryPage({
    searchParams,
}: {
    searchParams: Promise<{
        month?: string;
        year?: string;
    }>;
}) {
    const session = await auth();
    if (!session?.user) redirect('/login');

    const params = await searchParams;
    const now = new Date();
    // Default to current month (1-based) if not provided
    const monthParam = params?.month ? parseInt(params.month) : now.getMonth() + 1;
    const currentYear = params?.year ? parseInt(params.year) : now.getFullYear();

    // Convert 1-based param to 0-based index for Date/Backend
    const internalMonthIndex = monthParam - 1;

    const history = await getMonthlyMealHistory(currentYear, internalMonthIndex);

    // Pagination Logic
    const date = new Date(currentYear, internalMonthIndex, 1);
    const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Calculate Prev/Next dates
    const prevDate = new Date(currentYear, internalMonthIndex - 1, 1);
    const nextDate = new Date(currentYear, internalMonthIndex + 1, 1);

    // Bounds
    const MIN_DATE = new Date(2026, 1, 1); // Feb 1, 2026
    const MAX_DATE = addMonths(startOfMonth(new Date()), 6);

    // Logic: Disable if the target date is out of bounds
    // For Prev: If moving back takes us before MIN_DATE
    // E.g. date=Feb 2026. prevDate=Jan 2026. Jan < Feb -> Disabled.
    const showPrev = !isBefore(prevDate, MIN_DATE) || (prevDate.getTime() === MIN_DATE.getTime());
    // Actually consistent isBefore check: if prevDate < MIN_DATE, hide.
    // Note: Dates are 00:00 midnight. Feb 1 2026 compared to Feb 1 2026 is equal. 
    // isBefore(equal) is false. (!false) -> true. So show.
    // isBefore(Jan 1, Feb 1) is true. (!true) -> false. Hide. Correct.

    // For Next: If moving forward takes us after MAX_DATE
    const showNext = !isAfter(nextDate, MAX_DATE);

    // Convert back to 1-based for URL
    const prevLink = `/dashboard/meals/history?month=${prevDate.getMonth() + 1}&year=${prevDate.getFullYear()}`;
    const nextLink = `/dashboard/meals/history?month=${nextDate.getMonth() + 1}&year=${nextDate.getFullYear()}`;

    // Determine if Sahri should be shown
    // Condition 1: Current month overlaps with configured Ramadan range
    // Condition 2: Any existing Sahri record in fetching history (for legacy support or out-of-config/user overrides)
    const monthStart = new Date(currentYear, internalMonthIndex, 1);
    const monthEnd = endOfMonth(monthStart);
    const ramadanStart = new Date(RAMADAN_CONFIG.START);
    const ramadanEnd = new Date(RAMADAN_CONFIG.END);

    // Check overlap: (StartA <= EndB) and (EndA >= StartB)
    const isRamadanMonth = (monthStart <= ramadanEnd) && (monthEnd >= ramadanStart);

    const hasSahriData = history.some(day => day.sahriCount > 0);

    const showSahri = isRamadanMonth || hasSahriData;

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-4 md:p-6">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Meal History</h1>
                    <div className="flex items-center gap-4 bg-white/80 dark:bg-black/60 backdrop-blur-sm p-2 rounded-xl border border-white/20 dark:border-white/10 shadow-sm">
                        {showPrev ? (
                            <Link href={prevLink} className="p-2 hover:bg-gray-100/50 dark:hover:bg-zinc-800 rounded-full transition-colors">
                                <ChevronLeftIcon className="w-5 h-5" />
                            </Link>
                        ) : (
                            <span className="p-2 text-gray-300 dark:text-zinc-700 cursor-not-allowed">
                                <ChevronLeftIcon className="w-5 h-5" />
                            </span>
                        )}

                        <span className="font-bold min-w-[140px] text-center">{monthName}</span>

                        {showNext ? (
                            <Link href={nextLink} className="p-2 hover:bg-gray-100/50 dark:hover:bg-zinc-800 rounded-full transition-colors">
                                <ChevronRightIcon className="w-5 h-5" />
                            </Link>
                        ) : (
                            <span className="p-2 text-gray-300 dark:text-zinc-700 cursor-not-allowed">
                                <ChevronRightIcon className="w-5 h-5" />
                            </span>
                        )}
                    </div>
                </div>

                <div className="card-panel overflow-hidden p-0">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700/50">
                            <thead className="bg-gray-100 dark:bg-zinc-900 text-gray-600 dark:text-gray-400 text-xs tracking-wider border-b-2 border-gray-200 dark:border-gray-700 font-medium">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 tracking-wider">Lunch</th>
                                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 tracking-wider">Dinner</th>
                                    {showSahri && <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 tracking-wider">Sahri</th>}
                                </tr>
                            </thead>
                            <tbody className="bg-white/50 dark:bg-zinc-800/40 divide-y divide-gray-100 dark:divide-gray-700/50" suppressHydrationWarning>
                                {history.map((day) => (
                                    <tr key={day.date.toISOString()} className="hover:bg-gray-50 dark:hover:bg-zinc-700/50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                            {format(day.date, 'dd MMM, EEE')}
                                        </td>
                                        <td className="px-6 py-4 text-center align-top">
                                            <div className="flex flex-col items-center gap-2">
                                                <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", {
                                                    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300": day.lunchCount > 0,
                                                    "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400": day.lunchCount === 0
                                                })}>
                                                    {day.lunchCount} / {day.totalUsers}
                                                </span>
                                                {day.lunchCount > 0 && (
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[200px] leading-relaxed">
                                                        {day.lunchUsers.join(', ')}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center align-top">
                                            <div className="flex flex-col items-center gap-2">
                                                <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", {
                                                    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300": day.dinnerCount > 0,
                                                    "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400": day.dinnerCount === 0
                                                })}>
                                                    {day.dinnerCount} / {day.totalUsers}
                                                </span>
                                                {day.dinnerCount > 0 && (
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[200px] leading-relaxed">
                                                        {day.dinnerUsers.join(', ')}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        {showSahri && (
                                            <td className="px-6 py-4 text-center align-top">
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", {
                                                        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300": day.sahriCount > 0,
                                                        "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400": day.sahriCount === 0
                                                    })}>
                                                        {day.sahriCount} / {day.totalUsers}
                                                    </span>
                                                    {day.sahriCount > 0 && (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[200px] leading-relaxed">
                                                            {day.sahriUsers.join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </main>
    );
}
