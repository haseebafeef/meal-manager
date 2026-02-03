'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export default function MonthSelector({ months }: { months: string[] }) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { replace } = useRouter();

    const currentMonth = searchParams.get('month') || new Date().toISOString().slice(0, 7);

    function handleChange(term: string) {
        const params = new URLSearchParams(searchParams);
        if (term) {
            params.set('month', term);
        } else {
            params.delete('month');
        }
        replace(`${pathname}?${params.toString()}`);
    }

    return (
        <select
            className="block w-full rounded-md border border-gray-200 py-[9px] pl-3 text-sm outline-2 placeholder:text-gray-500 text-gray-900 md:w-48 dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
            defaultValue={currentMonth}
            onChange={(e) => handleChange(e.target.value)}
        >
            {months.map((month) => (
                <option key={month} value={month}>
                    {new Date(month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}
                </option>
            ))}
        </select>
    );
}
