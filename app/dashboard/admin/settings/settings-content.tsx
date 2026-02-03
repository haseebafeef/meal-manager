'use client';

import { useEffect, useState, useTransition } from 'react';
import { getSystemSettings, updateSystemSetting } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS } from '@/app/lib/constants';


export default function SettingsContent() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getSystemSettings().then(data => {
            if (data) setSettings(data);
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="p-8 text-center text-gray-500">Loading settings...</div>;

    return (
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm p-4 md:p-6 max-w-4xl mx-auto w-full border border-gray-100 dark:border-gray-700">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2 dark:border-gray-700">System Configuration</h2>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 dark:bg-zinc-900 text-gray-600 dark:text-gray-400 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3 rounded-l-lg">Configuration Name</th>
                            <th className="px-4 py-3">Value</th>
                            <th className="px-4 py-3 rounded-r-lg text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        <SettingRow
                            label="Lunch Cutoff Time"
                            description="Format: HH:MM (24-hour)"
                            settingKey={SETTINGS_KEYS.LUNCH_CUTOFF}
                            initialValue={settings[SETTINGS_KEYS.LUNCH_CUTOFF] || '11:00'}
                            type="time"
                        />
                        <SettingRow
                            label="Dinner Cutoff Time"
                            description="Format: HH:MM (24-hour)"
                            settingKey={SETTINGS_KEYS.DINNER_CUTOFF}
                            initialValue={settings[SETTINGS_KEYS.DINNER_CUTOFF] || '13:00'}
                            type="time"
                        />
                        <SettingRow
                            label="Default Meal Rate"
                            description="Fallback used for calculations"
                            settingKey={SETTINGS_KEYS.MEAL_RATE}
                            initialValue={settings[SETTINGS_KEYS.MEAL_RATE] || '70'}
                            type="number"
                            prefix="৳"
                        />
                        <SettingRow
                            label="Previous Month's Meal Rate"
                            description="For calculating costs of the previous month"
                            settingKey={SETTINGS_KEYS.PREV_MEAL_RATE}
                            initialValue={settings[SETTINGS_KEYS.PREV_MEAL_RATE] || '70'}
                            type="number"
                            prefix="৳"
                        />
                        <SettingRow
                            label="Auto Meal-Off Threshold"
                            description="Disable meals when balance hits this value (relative to 0)"
                            settingKey={SETTINGS_KEYS.AUTO_OFF_THRESHOLD}
                            initialValue={settings[SETTINGS_KEYS.AUTO_OFF_THRESHOLD] || '-500'}
                            type="number"
                            prefix="৳"
                        />
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function SettingRow({
    label,
    description,
    settingKey,
    initialValue,
    type,
    prefix
}: {
    label: string,
    description: string,
    settingKey: string,
    initialValue: string,
    type: string,
    prefix?: string
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [value, setValue] = useState(initialValue);
    const [isPending, startTransition] = useTransition();

    // Reset value if initialValue changes (from parent refresh)
    useEffect(() => { setValue(initialValue); }, [initialValue]);

    const handleSave = () => {
        startTransition(async () => {
            const res = await updateSystemSetting(settingKey, value);
            if (res?.error) {
                alert(res.error);
            } else {
                setIsEditing(false);
            }
        });
    };

    const handleCancel = () => {
        setValue(initialValue);
        setIsEditing(false);
    };

    return (
        <tr>
            <td className="px-4 py-4 font-medium align-top">
                {label}
                <p className="text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">{description}</p>
            </td>
            <td className="px-4 py-4 align-top">
                {isEditing ? (
                    <div className="flex items-center gap-2">
                        {prefix && <span className="text-gray-500">{prefix}</span>}
                        <input
                            type={type}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none w-32"
                            disabled={isPending}
                        />
                    </div>
                ) : (
                    <span className="text-gray-900 dark:text-white font-medium py-1.5 block">
                        {prefix} {value}
                    </span>
                )}
            </td>
            <td className="px-4 py-4 text-right align-top">
                {isEditing ? (
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={handleCancel}
                            disabled={isPending}
                            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-zinc-700 rounded hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isPending}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {isPending ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                    >
                        Edit
                    </button>
                )}
            </td>
        </tr>
    );
}
