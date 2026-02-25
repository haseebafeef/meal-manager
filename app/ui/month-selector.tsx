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

    // Extract selectedYear and selectedMonth from currentMonth for the new value prop
    const [selectedYear, selectedMonth] = currentMonth.split('-');

    // Adapt handleMonthChange to fit the existing handleChange logic
    const handleMonthChange = (month: number, year: number) => {
        const newMonthTerm = `${year}-${String(month).padStart(2, '0')}`;
        handleChange(newMonthTerm);
    };

    return (
        <div className="relative group">
            <select
                id="month-selector"
                name="month-selector"
                className="peer input-compact pr-8 pl-3 font-bold bg-white/50 dark:bg-zinc-800/50 backdrop-blur-sm"
                value={`${selectedYear}-${selectedMonth}`} // Use selectedYear and selectedMonth
                onChange={(e) => {
                    const [y, m] = e.target.value.split('-');
                    handleMonthChange(parseInt(m), parseInt(y));
                }}
            >
                {months.map((month) => (
                    <option key={month} value={month}>
                        {new Date(month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </option>
                ))}
            </select>
        </div>
    );
}
