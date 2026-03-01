'use client';

import { Switch } from '@headlessui/react';
import { useState } from 'react';
import { updateDefaultMealPreference } from '@/app/lib/meal-actions';
import { RAMADAN_CONFIG } from '@/app/lib/constants';

import clsx from 'clsx';

export default function DefaultMealToggle({ defaultLunch, defaultDinner, defaultSahri, targetUserId }: { defaultLunch: boolean, defaultDinner: boolean, defaultSahri: boolean, targetUserId?: string }) {
    const [lunchStatus, setLunchStatus] = useState(defaultLunch);
    const [dinnerStatus, setDinnerStatus] = useState(defaultDinner);
    const [isUpdating, setIsUpdating] = useState(false);
    const [sahriStatus, setSahriStatus] = useState(defaultSahri);

    // active date check could be prop or hardcoded
    const now = new Date();
    const s = new Date(RAMADAN_CONFIG.START);
    const e = new Date(RAMADAN_CONFIG.END);
    const showSahri = now >= s && now <= e;

    const handleToggle = async (type: 'lunch' | 'dinner' | 'sahri') => {
        setIsUpdating(true);
        let val = false;
        if (type === 'lunch') val = !lunchStatus;
        if (type === 'dinner') val = !dinnerStatus;
        if (type === 'sahri') val = !sahriStatus;

        try {
            const result = await updateDefaultMealPreference(type, val, targetUserId);
            if (result.success) {
                if (type === 'lunch') setLunchStatus(val);
                if (type === 'dinner') setDinnerStatus(val);
                if (type === 'sahri') setSahriStatus(val);
            } else {
                alert(result.error || "Failed to update");
            }
        } catch (e) {
            console.error(e);
            alert("Error updating");
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 p-4 bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-gray-100 dark:border-zinc-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 tracking-wider">Default Preferences</h3>

            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-700 dark:text-gray-200">Lunch</span>
                    <Switch
                        checked={lunchStatus}
                        onChange={() => handleToggle('lunch')}
                        disabled={isUpdating}
                        className={clsx(
                            lunchStatus ? 'bg-blue-600' : 'bg-gray-200 dark:bg-zinc-600',
                            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2'
                        )}
                    >
                        <span
                            aria-hidden="true"
                            className={clsx(
                                lunchStatus ? 'translate-x-5' : 'translate-x-0',
                                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                            )}
                        />
                    </Switch>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-700 dark:text-gray-200">Dinner</span>
                    <Switch
                        checked={dinnerStatus}
                        onChange={() => handleToggle('dinner')}
                        disabled={isUpdating}
                        className={clsx(
                            dinnerStatus ? 'bg-blue-600' : 'bg-gray-200 dark:bg-zinc-600',
                            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2'
                        )}
                    >
                        <span
                            aria-hidden="true"
                            className={clsx(
                                dinnerStatus ? 'translate-x-5' : 'translate-x-0',
                                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                            )}
                        />
                    </Switch>
                </div>

                {showSahri && (
                    <div className="flex items-center justify-between pt-2 border-t dark:border-zinc-700">
                        <span className="text-base font-semibold text-indigo-600 dark:text-indigo-400">Sahri (Ramadan)</span>
                        <Switch
                            checked={sahriStatus}
                            onChange={() => handleToggle('sahri')}
                            disabled={isUpdating}
                            className={clsx(
                                sahriStatus ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-zinc-600',
                                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2'
                            )}
                        >
                            <span
                                aria-hidden="true"
                                className={clsx(
                                    sahriStatus ? 'translate-x-5' : 'translate-x-0',
                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                                )}
                            />
                        </Switch>
                    </div>
                )}
            </div>
        </div>
    );
}
