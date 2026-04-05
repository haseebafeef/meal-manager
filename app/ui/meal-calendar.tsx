'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isBefore, isAfter, startOfDay, addMonths, subMonths, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { updateMealCount } from '@/app/actions/meals/update-meal-count';
import { RAMADAN_CONFIG } from '@/app/lib/constants';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';

type MealStatus = {
    date: Date | string;
    lunch: number;
    dinner: number;
    sahri?: number; // Optional as old records might miss it (though we backfilled via Prisma default?)
};

export default function MealCalendar({ initialStatuses, targetUserId, adminOverride = false, defaultLunch = false, defaultDinner = false, userJoinedDate }: { initialStatuses: MealStatus[], targetUserId?: string, adminOverride?: boolean, defaultLunch?: boolean, defaultDinner?: boolean, defaultSahri?: boolean, userJoinedDate?: Date }) {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const router = useRouter();

    const [localOverrides, setLocalOverrides] = useState<Record<string, number>>({});
    const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());
    const debounceRefs = useRef<Record<string, NodeJS.Timeout>>({});
    const [, startTransition] = useTransition();

    useEffect(() => {
        setLocalOverrides(prev => {
            let changed = false;
            const next = { ...prev };
            for (const s of initialStatuses) {
                const dateKey = new Date(s.date).toDateString();
                for (const type of ['lunch', 'dinner', 'sahri'] as const) {
                    const overrideKey = `${dateKey}-${type}`;
                    if (overrideKey in next && next[overrideKey] === (s[type] || 0)) {
                        delete next[overrideKey];
                        changed = true;
                    }
                }
            }
            return changed ? next : prev;
        });
    }, [initialStatuses]);

    // Status Map for O(1) lookup
    const statusMap = new Map();
    initialStatuses.forEach(s => {
        statusMap.set(new Date(s.date).toDateString(), s);
    });

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const days = eachDayOfInterval({
        start: startDate,
        end: endDate,
    });

    const handleUpdate = (date: Date, type: 'lunch' | 'dinner' | 'sahri', newCount: number) => {
        const dateKey = date.toDateString();
        const overrideKey = `${dateKey}-${type}`;

        // 1. Instantly reflect locally
        setLocalOverrides(prev => ({ ...prev, [overrideKey]: newCount }));

        // 2. Clear existing debounce
        if (debounceRefs.current[overrideKey]) {
            clearTimeout(debounceRefs.current[overrideKey]);
        }

        // 3. Set new debounce for Server Action
        debounceRefs.current[overrideKey] = setTimeout(() => {
            setUpdatingKeys(prev => {
                const next = new Set(prev);
                next.add(overrideKey);
                return next;
            });

            startTransition(async () => {
                try {
                    const result = await updateMealCount(format(date, 'yyyy-MM-dd'), type, newCount, targetUserId);
                    if (result.error) {
                        alert(result.error);
                        setLocalOverrides(prev => { const n = { ...prev }; delete n[overrideKey]; return n; });
                    } else {
                        router.refresh();
                    }
                } catch (e) {
                    console.error("Failed to update meal", e);
                    alert("Failed to update meal status.");
                    setLocalOverrides(prev => { const n = { ...prev }; delete n[overrideKey]; return n; });
                } finally {
                    setUpdatingKeys(prev => {
                        const next = new Set(prev);
                        next.delete(overrideKey);
                        return next;
                    });
                }
            });
        }, 300);
    };

    // Navigation Bounds
    const MIN_DATE = new Date(2026, 1, 1); // System launch date or effective start of records.

    // Dynamic End: Limit future navigation to prevents accidental long-range entry.
    // Window is currently set to current month + 6 months.
    const MAX_DATE = addMonths(startOfMonth(new Date()), 6);

    const isPrevDisabled = isSameMonth(currentMonth, MIN_DATE) || isBefore(currentMonth, MIN_DATE);
    const isNextDisabled = isSameMonth(currentMonth, MAX_DATE) || isAfter(currentMonth, MAX_DATE);

    const handlePrevious = () => {
        if (!isPrevDisabled) setCurrentMonth(subMonths(currentMonth, 1));
    };

    const handleNext = () => {
        if (!isNextDisabled) setCurrentMonth(addMonths(currentMonth, 1));
    };

    const handleToday = () => {
        const now = new Date();
        if (isBefore(now, MIN_DATE)) {
            setCurrentMonth(MIN_DATE);
        } else if (isAfter(now, MAX_DATE)) {
            setCurrentMonth(MAX_DATE);
        } else {
            setCurrentMonth(now);
        }
    };

    const defaultLunchVal = defaultLunch ? 1 : 0;
    const defaultDinnerVal = defaultDinner ? 1 : 0;

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePrevious}
                        disabled={isPrevDisabled}
                        className={clsx("p-2 rounded-full transition-colors", {
                            "hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300": !isPrevDisabled,
                            "opacity-30 cursor-not-allowed text-gray-400": isPrevDisabled
                        })}
                        aria-label="Previous Month"
                    >
                        <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <button
                        onClick={handleToday}
                        className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/50 transition-all shadow-sm"
                    >
                        Today
                    </button>
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white capitalize">
                    {format(currentMonth, 'MMMM yyyy')}
                </h2>
                <button
                    onClick={handleNext}
                    disabled={isNextDisabled}
                    className={clsx("p-2 rounded-full transition-colors", {
                        "hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300": !isNextDisabled,
                        "opacity-30 cursor-not-allowed text-gray-400": isNextDisabled
                    })}
                    aria-label="Next Month"
                >
                    <ChevronRightIcon className="h-5 w-5" />
                </button>
            </div>

            {/* Calendar Grid Container with Scroll */}
            <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                <div className="min-w-[500px] md:min-w-0">
                    <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day) => {
                            const dateKey = day.toDateString();

                            // Client-side visual disable check (matches server logic loosely)
                            const now = new Date();
                            const isPast = isBefore(startOfDay(day), startOfDay(now));

                            // Default Logic:
                            // - If record exists: use it.
                            // - If no record:
                            //   - PAST: Default to 1 (Legacy ON)
                            //   - FUTURE/TODAY: Use prop value (defaultLunchVal, defaultDinnerVal)
                            let fallback = { lunch: 1, dinner: 1, sahri: 1 };

                            if (userJoinedDate && isBefore(startOfDay(day), startOfDay(userJoinedDate))) {
                                // Before user existed: absolute zero fallback regardless of past/future status
                                fallback = { lunch: 0, dinner: 0, sahri: 0 };
                            } else if (!isPast) {
                                fallback = { lunch: defaultLunchVal, dinner: defaultDinnerVal, sahri: 0 }; // Default Sahri OFF for now in UI unless we fetch it
                            }

                            const status = statusMap.get(dateKey) || fallback;
                            const lunchOverride = localOverrides[`${dateKey}-lunch`];
                            const dinnerOverride = localOverrides[`${dateKey}-dinner`];
                            const sahriOverride = localOverrides[`${dateKey}-sahri`];

                            const currentLunch = lunchOverride !== undefined ? lunchOverride : status.lunch;
                            const currentDinner = dinnerOverride !== undefined ? dinnerOverride : status.dinner;
                            const currentSahri = sahriOverride !== undefined ? sahriOverride : (status.sahri || 0);

                            const futureLimit = endOfMonth(addMonths(now, 2));
                            const isFutureLocked = isAfter(day, futureLimit);

                            const adminPastLimit = subDays(startOfDay(now), 10);
                            const isTooOldForAdmin = isBefore(day, adminPastLimit);

                            const isLocked = adminOverride
                                ? (isTooOldForAdmin || isFutureLocked)
                                : (isPast || isFutureLocked);

                            const renderButton = (type: 'lunch' | 'dinner' | 'sahri', count: number) => {
                                const overrideKey = `${dateKey}-${type}`;
                                const isUpdating = updatingKeys.has(overrideKey);
                                const buttonLocked = isLocked || isUpdating;

                                const isLunch = type === 'lunch';
                                const isSahri = type === 'sahri';
                                let label = 'D'; // Dinner
                                if (isLunch) label = 'L';
                                if (isSahri) label = 'S';
                                const isOn = count > 0;

                                // Main Click Logic
                                const handleMainClick = () => {
                                    if (buttonLocked) return;
                                    if (count > 1) {
                                        handleUpdate(day, type, count - 1);
                                    } else if (count === 1) {
                                        handleUpdate(day, type, 0);
                                    } else {
                                        handleUpdate(day, type, 1);
                                    }
                                };

                                // Plus Click Logic
                                const handlePlusClick = (e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    if (buttonLocked) return;
                                    handleUpdate(day, type, count + 1);
                                };

                                return (
                                    <div className="relative group">
                                        <button
                                            onClick={handleMainClick}
                                            disabled={buttonLocked}
                                            className={clsx("w-full text-xs py-2 px-1 rounded font-medium transition-colors relative flex justify-center items-center min-h-[32px]", {
                                                "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50": isOn,
                                                "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50": !isOn,
                                                "opacity-50 cursor-not-allowed": buttonLocked
                                            })}
                                        >
                                            {label}: {isOn ? (
                                                count > 1 ? (
                                                    <>ON <span className="font-extrabold text-indigo-600 dark:text-indigo-300 ml-0.5">({count})</span></>
                                                ) : 'ON'
                                            ) : 'OFF'}
                                        </button>

                                        {/* Plus Icon - show only if ON and not locked */}
                                        {isOn && !buttonLocked && (
                                            <div
                                                onClick={handlePlusClick}
                                                className="absolute -top-1 -right-1 cursor-pointer hover:scale-110 transition-transform z-10 p-1"
                                                title="Add Extra Meal"
                                            >
                                                <PlusIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400 stroke-2" />
                                            </div>
                                        )}
                                    </div>
                                );
                            };

                            return (
                                <div key={dateKey} className={clsx("min-h-[80px] border rounded-lg p-1 flex flex-col gap-1 dark:border-gray-700", {
                                    "bg-gray-50 dark:bg-zinc-900/30 opacity-40 grayscale": !isSameMonth(day, currentMonth),
                                    "bg-white dark:bg-zinc-800": isSameMonth(day, currentMonth),
                                    "border-blue-200 ring-1 ring-blue-200 dark:border-blue-700 dark:ring-blue-700": isToday(day)
                                })}>
                                    <div className="text-right text-xs text-gray-400">{format(day, 'd')}</div>

                                    <div className="flex flex-col gap-1.5 mt-1">
                                        {renderButton('lunch', currentLunch)}
                                        {renderButton('dinner', currentDinner)}

                                        {/* Sahri (Render Last) */}
                                        {(() => {
                                            // Dynamic check using config
                                            const s = new Date(RAMADAN_CONFIG.START);
                                            const e = new Date(RAMADAN_CONFIG.END);
                                            const isActive = day >= s && day <= e;

                                            if (isActive) {
                                                return renderButton('sahri', currentSahri);
                                            }
                                            return null;
                                        })()}
                                    </div>
                                </div>
                            );
                        })}
                    </div >
                </div >
            </div >
        </div >
    );
}
