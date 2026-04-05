'use client';

import { Switch } from '@headlessui/react';
import { useTransition, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { updateDefaultMealPreference } from '@/app/actions/meals/update-default-preference';
import { RAMADAN_CONFIG } from '@/app/lib/constants';

import clsx from 'clsx';

export default function DefaultMealToggle({ defaultLunch, defaultDinner, defaultSahri, targetUserId }: { defaultLunch: boolean, defaultDinner: boolean, defaultSahri: boolean, targetUserId?: string }) {
    const [localOverrides, setLocalOverrides] = useState<Record<string, boolean>>({});
    const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());
    const debounceRefs = useRef<Record<string, NodeJS.Timeout>>({});
    const router = useRouter();
    const [, startTransition] = useTransition();

    useEffect(() => {
        setLocalOverrides(prev => {
            const next = { ...prev };
            let changed = false;
            if ('lunch' in next && next['lunch'] === defaultLunch) { delete next['lunch']; changed = true; }
            if ('dinner' in next && next['dinner'] === defaultDinner) { delete next['dinner']; changed = true; }
            if ('sahri' in next && next['sahri'] === defaultSahri) { delete next['sahri']; changed = true; }
            return changed ? next : prev;
        });
    }, [defaultLunch, defaultDinner, defaultSahri]);

    const activeLunch = 'lunch' in localOverrides ? localOverrides['lunch'] : defaultLunch;
    const activeDinner = 'dinner' in localOverrides ? localOverrides['dinner'] : defaultDinner;
    const activeSahri = 'sahri' in localOverrides ? localOverrides['sahri'] : defaultSahri;

    // active date check could be prop or hardcoded
    const now = new Date();
    const s = new Date(RAMADAN_CONFIG.START);
    const e = new Date(RAMADAN_CONFIG.END);
    const showSahri = now >= s && now <= e;

    const handleToggle = (type: 'lunch' | 'dinner' | 'sahri') => {
        let currentActive = false;
        if (type === 'lunch') currentActive = activeLunch;
        if (type === 'dinner') currentActive = activeDinner;
        if (type === 'sahri') currentActive = activeSahri;
        
        const newVal = !currentActive;

        setLocalOverrides(prev => ({ ...prev, [type]: newVal }));

        if (debounceRefs.current[type]) clearTimeout(debounceRefs.current[type]);

        debounceRefs.current[type] = setTimeout(() => {
            setUpdatingKeys(prev => {
                const next = new Set(prev);
                next.add(type);
                return next;
            });

            startTransition(async () => {
                try {
                    const result = await updateDefaultMealPreference(type, newVal, targetUserId);
                    if (!result.success) {
                        alert(result.error || "Failed to update");
                        setLocalOverrides(prev => { const n = {...prev}; delete n[type]; return n; });
                    } else {
                        router.refresh();
                    }
                } catch (e) {
                    console.error(e);
                    alert("Error updating");
                    setLocalOverrides(prev => { const n = {...prev}; delete n[type]; return n; });
                } finally {
                    setUpdatingKeys(prev => {
                        const next = new Set(prev);
                        next.delete(type);
                        return next;
                    });
                }
            });
        }, 300);
    };

    return (
        <div className="flex flex-col gap-3 p-4 bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-gray-100 dark:border-zinc-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 tracking-wider">Default Preferences</h3>

            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-700 dark:text-gray-200">Lunch</span>
                    <Switch
                        checked={activeLunch}
                        onChange={() => handleToggle('lunch')}
                        disabled={updatingKeys.has('lunch')}
                        className={clsx(
                            activeLunch ? 'bg-blue-600' : 'bg-gray-200 dark:bg-zinc-600',
                            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2',
                            updatingKeys.has('lunch') && 'opacity-50 cursor-not-allowed'
                        )}
                    >
                        <span
                            aria-hidden="true"
                            className={clsx(
                                activeLunch ? 'translate-x-5' : 'translate-x-0',
                                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                            )}
                        />
                    </Switch>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-700 dark:text-gray-200">Dinner</span>
                    <Switch
                        checked={activeDinner}
                        onChange={() => handleToggle('dinner')}
                        disabled={updatingKeys.has('dinner')}
                        className={clsx(
                            activeDinner ? 'bg-blue-600' : 'bg-gray-200 dark:bg-zinc-600',
                            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2',
                            updatingKeys.has('dinner') && 'opacity-50 cursor-not-allowed'
                        )}
                    >
                        <span
                            aria-hidden="true"
                            className={clsx(
                                activeDinner ? 'translate-x-5' : 'translate-x-0',
                                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                            )}
                        />
                    </Switch>
                </div>

                {showSahri && (
                    <div className="flex items-center justify-between pt-2 border-t dark:border-zinc-700">
                        <span className="text-base font-semibold text-indigo-600 dark:text-indigo-400">Sahri (Ramadan)</span>
                            <Switch
                                checked={activeSahri}
                                onChange={() => handleToggle('sahri')}
                                disabled={updatingKeys.has('sahri')}
                                className={clsx(
                                    activeSahri ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-zinc-600',
                                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2',
                                    updatingKeys.has('sahri') && 'opacity-50 cursor-not-allowed'
                                )}
                            >
                                <span
                                    aria-hidden="true"
                                    className={clsx(
                                        activeSahri ? 'translate-x-5' : 'translate-x-0',
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
