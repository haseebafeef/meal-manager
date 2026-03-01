import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import MealCalendar from '@/app/ui/meal-calendar';
import { getMealStatus } from '@/app/lib/meal-actions';
import { ThemeToggle } from '@/app/ui/theme-toggle';
import DefaultMealToggle from '@/app/ui/default-meal-toggle';

import { prisma } from '@/app/lib/prisma';
import UserDropdown from '@/app/ui/user-dropdown';
import Link from 'next/link';

import { getSystemSettings } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS } from '@/app/lib/constants';



function formatTime(timeStr: string) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    return `${h}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

export default async function MealsPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/login');

    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!currentUser) redirect('/login');

    const statusPromise = getMealStatus();
    const settingsPromise = getSystemSettings();
    const [statuses, settings] = await Promise.all([statusPromise, settingsPromise]);

    const lunchTime = formatTime(settings?.[SETTINGS_KEYS.LUNCH_CUTOFF] || '11:00');
    const dinnerTime = formatTime(settings?.[SETTINGS_KEYS.DINNER_CUTOFF] || '13:00');

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 p-4 md:p-6 transition-colors duration-300">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Meal Manager</h1>
                <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
                    <ThemeToggle />
                    <Link href="/dashboard" className="btn-secondary">Back to Dashboard</Link>
                    <UserDropdown user={currentUser} />
                </div>
            </div>

            <div className="mb-6 p-4 rounded-lg bg-white dark:bg-zinc-800 border border-gray-100 dark:border-gray-700 shadow-sm text-sm text-gray-600 dark:text-gray-400">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                    <div>
                        <p className="mb-1">
                            Manage your daily meals. By default, meals are set to your preference.
                        </p>
                    </div>
                    {/* Toggle */}
                    <DefaultMealToggle
                        defaultLunch={currentUser.defaultLunchStatus}
                        defaultDinner={currentUser.defaultDinnerStatus}

                        defaultSahri={currentUser.defaultSahriStatus}
                    />
                </div>

                <p className="mb-2">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Guest Meals:</span> To add guest meals, click the
                    <span className="inline-block mx-1 align-middle"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-indigo-500"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></span>
                    icon on the top-right of an active day (only if your meal is ON).
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-2 mt-2">
                    Cutoff Time: Lunch <span className="font-medium text-gray-700 dark:text-gray-300">({lunchTime})</span>,
                    Dinner <span className="font-medium text-gray-700 dark:text-gray-300">({dinnerTime})</span>
                </p>
            </div>

            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm p-4 md:p-6 max-w-4xl mx-auto w-full border border-gray-100 dark:border-gray-700">
                <MealCalendar
                    initialStatuses={statuses}
                    defaultLunch={currentUser.defaultLunchStatus}
                    defaultDinner={currentUser.defaultDinnerStatus}

                    defaultSahri={currentUser.defaultSahriStatus}
                    userJoinedDate={currentUser.createdAt}
                />
            </div>
        </main>
    );
}
