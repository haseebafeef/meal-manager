'use client';

import { Switch } from '@headlessui/react';
import { useState } from 'react';
import { updateDefaultMealPreference } from '@/app/lib/meal-actions';
import { useRouter } from 'next/navigation';

export default function DefaultMealToggle({ initialLunch, initialDinner, targetUserId }: { initialLunch: boolean, initialDinner: boolean, targetUserId?: string }) {
    const [lunchEnabled, setLunchEnabled] = useState(initialLunch);
    const [dinnerEnabled, setDinnerEnabled] = useState(initialDinner);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    async function handleToggle(type: 'lunch' | 'dinner', checked: boolean) {
        if (type === 'lunch') setLunchEnabled(checked);
        else setDinnerEnabled(checked);

        setIsLoading(true);
        try {
            await updateDefaultMealPreference(type, checked, targetUserId);
            router.refresh();
        } catch (error) {
            console.error(error);
            // Revert on error
            if (type === 'lunch') setLunchEnabled(!checked);
            else setDinnerEnabled(!checked);
        } finally {
            setIsLoading(false);
        }
    }

    function ToggleItem({ label, enabled, onChange }: { label: string, enabled: boolean, onChange: (val: boolean) => void }) {
        return (
            <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${enabled ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                    {label}: <span className={enabled ? 'text-green-600 dark:text-green-400 font-bold' : 'font-normal'}>{enabled ? 'ON' : 'OFF'}</span>
                </span>
                <Switch
                    checked={enabled}
                    onChange={onChange}
                    disabled={isLoading}
                    className={`${enabled ? 'bg-green-600' : 'bg-gray-200 dark:bg-zinc-700'}
            relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 dark:focus:ring-offset-zinc-900`}
                >
                    <span className="sr-only">Toggle {label}</span>
                    <span
                        aria-hidden="true"
                        className={`${enabled ? 'translate-x-5' : 'translate-x-0'}
                pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                    />
                </Switch>
            </div>
        );
    }

    return (
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            <ToggleItem label="Default Lunch" enabled={lunchEnabled} onChange={(v) => handleToggle('lunch', v)} />
            <ToggleItem label="Default Dinner" enabled={dinnerEnabled} onChange={(v) => handleToggle('dinner', v)} />
        </div>
    );
}
