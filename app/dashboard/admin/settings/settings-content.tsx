'use client';

import { useEffect, useState, useTransition } from 'react';
import { getSystemSettings, updateSystemSetting } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS } from '@/app/lib/constants';
import { autoComputePrevMonthRate } from '@/app/lib/expenses/mutations';


export default function SettingsContent() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    // refreshSettings is called after an auto-calculate or save to re-fetch latest values.
    // It intentionally does NOT set loading=true to avoid a full-screen flash on minor updates.
    const refreshSettings = () => {
        getSystemSettings().then(data => {
            if (data) setSettings(data);
        });
    };

    // Initial load — inline to avoid calling setState synchronously in the effect body.
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
                    <thead className="bg-gray-100 dark:bg-zinc-900 text-gray-600 dark:text-gray-400 text-xs">
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
                            label="Sahri Cutoff Time"
                            description="Format: HH:MM (24-hour)"
                            settingKey={SETTINGS_KEYS.SAHRI_CUTOFF}
                            initialValue={settings[SETTINGS_KEYS.SAHRI_CUTOFF] || '18:00'}
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
                        {/* Previous Month Rate — special row with auto-calculate */}
                        <PrevRateSettingRow
                            initialValue={settings[SETTINGS_KEYS.PREV_MEAL_RATE] || '70'}
                            source={(settings[SETTINGS_KEYS.PREV_MEAL_RATE_SOURCE] || 'override') as 'auto' | 'override'}
                            onSaved={refreshSettings}
                        />
                        <SettingRow
                            label="Auto Meal-Off Threshold"
                            description="Disable meals when balance hits this value (relative to 0)"
                            settingKey={SETTINGS_KEYS.AUTO_OFF_THRESHOLD}
                            initialValue={settings[SETTINGS_KEYS.AUTO_OFF_THRESHOLD] || '-500'}
                            type="number"
                            prefix="৳"
                        />
                        <SettingRow
                            label="Daily Report Delivery Time"
                            description="When to send the push notification (Dhaka Time)"
                            settingKey={SETTINGS_KEYS.REPORT_DELIVERY_TIME}
                            initialValue={settings[SETTINGS_KEYS.REPORT_DELIVERY_TIME] || '10:00'}
                            type="time"
                        />
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Generic setting row (unchanged behaviour)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Special row for Previous Month Meal Rate
// Supports: auto-calculate button + source badge + admin override
// ---------------------------------------------------------------------------
type CalcResult = {
    rate?: number;
    totalExpenses?: number;
    totalMeals?: number;
    saved?: boolean;
    success?: string;
    error?: string;
};

function PrevRateSettingRow({
    initialValue,
    source,
    onSaved,
}: {
    initialValue: string;
    source: 'auto' | 'override';
    onSaved: () => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [value, setValue] = useState(initialValue);
    const [currentSource, setCurrentSource] = useState<'auto' | 'override'>(source);
    const [isPending, startTransition] = useTransition();
    const [isCalculating, setIsCalculating] = useState(false);
    const [calcResult, setCalcResult] = useState<CalcResult | null>(null);

    useEffect(() => {
        setValue(initialValue);
        setCurrentSource(source);
    }, [initialValue, source]);

    // Determine prev month (relative to "now" in Dhaka — server runs UTC+6)
    const getPrevMonthParams = () => {
        const now = new Date();
        // Approximate Dhaka month: UTC+6 offset
        const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000);
        let month = dhaka.getUTCMonth(); // 0-indexed
        let year = dhaka.getUTCFullYear();
        if (month === 0) { month = 12; year -= 1; }
        // month is now 1-indexed for the previous month
        return { year, monthNum: month };
    };

    const handleAutoCalculate = async () => {
        setIsCalculating(true);
        setCalcResult(null);
        try {
            const { year, monthNum } = getPrevMonthParams();
            const result = await autoComputePrevMonthRate(year, monthNum);
            setCalcResult(result as CalcResult);
            if (result.saved && result.rate !== undefined) {
                setValue(String(result.rate));
                setCurrentSource('auto');
                onSaved(); // refresh parent settings
            }
        } catch (e) {
            console.error('Auto-calculate failed', e);
        } finally {
            setIsCalculating(false);
        }
    };

    const handleAdminSave = () => {
        startTransition(async () => {
            // Save the rate
            const res = await updateSystemSetting(SETTINGS_KEYS.PREV_MEAL_RATE, value);
            if (res?.error) { alert(res.error); return; }

            // Mark source as admin override
            await updateSystemSetting(SETTINGS_KEYS.PREV_MEAL_RATE_SOURCE, 'override');

            setCurrentSource('override');
            setIsEditing(false);
            setCalcResult(null);
            onSaved();
        });
    };

    const handleCancel = () => {
        setValue(initialValue);
        setIsEditing(false);
        setCalcResult(null);
    };

    const monthLabel = (() => {
        const { year, monthNum } = getPrevMonthParams();
        return new Date(year, monthNum - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    })();

    return (
        <tr>
            <td className="px-4 py-4 font-medium align-top">
                Previous Month&apos;s Meal Rate
                <p className="text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                    Actual cost per meal for the previous month
                </p>
                {/* Source badge */}
                <span className={`inline-flex items-center mt-1 gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${currentSource === 'auto'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                    {currentSource === 'auto' ? '⚙ Auto-calculated' : '✎ Admin Override'}
                </span>
            </td>

            <td className="px-4 py-4 align-top">
                {isEditing ? (
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500">৳</span>
                        <input
                            type="number"
                            value={value}
                            step="0.01"
                            onChange={(e) => setValue(e.target.value)}
                            className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none w-32"
                            disabled={isPending}
                        />
                    </div>
                ) : (
                    <span className="text-gray-900 dark:text-white font-medium py-1.5 block">৳ {value}</span>
                )}

                {/* Auto-calc result breakdown */}
                {calcResult && (
                    <div className={`mt-2 text-xs rounded p-2 ${calcResult.saved
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                        }`}>
                        {calcResult.saved ? (
                            <>
                                <p className="font-semibold">Rate saved: ৳{calcResult.rate}</p>
                                <p>৳{calcResult.totalExpenses?.toFixed(2) || '0.00'} expenses ÷ {calcResult.totalMeals || 0} meals</p>
                            </>
                        ) : (
                            <p>{calcResult.error || 'Could not calculate.'}</p>
                        )}
                    </div>
                )}
            </td>

            <td className="px-4 py-4 text-right align-top">
                <div className="flex flex-col items-end gap-2">
                    {/* Auto-calculate button — always visible */}
                    <button
                        onClick={handleAutoCalculate}
                        disabled={isCalculating || isPending}
                        title={`Auto-calculate from ${monthLabel} data`}
                        className="px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                        {isCalculating ? 'Calculating…' : `⚙ Auto (${monthLabel})`}
                    </button>

                    {/* Edit / Save / Cancel — standard admin override */}
                    {isEditing ? (
                        <div className="flex gap-2">
                            <button
                                onClick={handleCancel}
                                disabled={isPending}
                                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-zinc-700 rounded hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAdminSave}
                                disabled={isPending}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {isPending ? 'Saving…' : 'Override & Save'}
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="px-4 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                        >
                            Edit Override
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}
