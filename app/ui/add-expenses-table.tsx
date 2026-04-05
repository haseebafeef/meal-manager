'use client';

import { useState, useEffect, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { addBatchExpenses } from '@/app/actions/expenses/add-batch-expenses';
import { PlusIcon, TrashIcon, PhotoIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
// Removed useRouter as we might just want to reset form or rely on revalidate

type ExpenseRow = {
    id: number;
    description: string;
    volume?: string;
    unit?: string;
    unitPrice?: string;
    amount: string;
    image?: File | null;
    isManual: boolean;
};

export default function AddExpensesTable() {
    const [rows, setRows] = useState<ExpenseRow[]>([
        { id: 0, description: '', amount: '', isManual: false }
    ]);
    const [state, dispatch] = useActionState(addBatchExpenses, null);

    const addRow = () => {
        if (rows.length >= 20) return;
        setRows([...rows, { id: Date.now(), description: '', amount: '', isManual: false }]);
    };

    const removeRow = (id: number) => {
        if (rows.length <= 1) return;
        setRows(rows.filter(r => r.id !== id));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateRow = (id: number, field: keyof ExpenseRow, value: any) => {
        setRows(prev => prev.map(row => {
            if (row.id !== id) return row;

            const updated = { ...row, [field]: value };

            if (field === 'amount') {
                updated.isManual = true;
            } else if (field === 'unit' || field === 'unitPrice') {
                // Calculation: Unit * Unit Price
                const u = parseFloat(updated.unit || '0');
                const p = parseFloat(updated.unitPrice || '0');

                if (updated.unit && updated.unitPrice && u > 0 && p > 0) {
                    updated.amount = (u * p).toFixed(2);
                    updated.isManual = false;
                }
            }
            return updated;
        }));
    };

    useEffect(() => {
        if (state?.success) {
            const t = setTimeout(() => {
                setRows([{ id: Date.now(), description: '', amount: '', isManual: false }]);
            }, 0);
            return () => clearTimeout(t);
        }
    }, [state]);

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800 shadow-sm p-4 w-full">
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Add Expenses</h2>

            <form action={dispatch}>
                <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg mb-4">
                    <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600 table-fixed" style={{ minWidth: '450px' }}>
                        <thead className="bg-gray-100 dark:bg-zinc-700">
                            <tr>
                                <th className="px-0.5 py-1 text-center text-[8px] md:text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase w-[5%]">#</th>
                                <th className="px-1 py-1 text-left text-[8px] md:text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase w-[25%] whitespace-normal">Item / Description</th>
                                <th className="px-1 py-1 text-left text-[8px] md:text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase w-[12%]">Vol</th>
                                <th className="px-1 py-1 text-left text-[8px] md:text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase w-[10%]">Qty</th>
                                <th className="px-1 py-1 text-left text-[8px] md:text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase w-[15%]">Rate</th>
                                <th className="px-1 py-1 text-left text-[8px] md:text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase w-[18%]">Total</th>
                                <th className="px-1 py-1 text-center text-[8px] md:text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase w-[10%]">Memo</th>
                                <th className="px-1 py-1 w-[5%]"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-zinc-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {rows.map((row, index) => (
                                <tr key={row.id}>
                                    <td className="px-0.5 py-0.5 md:py-1 text-center text-[9px] md:text-sm text-gray-900 dark:text-gray-100 font-medium">{index + 1}</td>
                                    <td className="px-0.5 py-0.5 md:py-1">
                                        <input
                                            type="text"
                                            name={`entry_${index}_description`}
                                            value={row.description}
                                            onChange={e => updateRow(row.id, 'description', e.target.value)}
                                            className="block w-full border border-gray-400 dark:border-gray-600 rounded-md text-[9px] md:text-xs py-0.5 px-1 md:py-1 md:px-1.5 focus:ring-red-500 focus:border-red-500 text-gray-900 dark:text-white bg-transparent placeholder:text-gray-400"
                                            placeholder="Item"
                                            required
                                        />
                                    </td>
                                    <td className="px-0.5 py-0.5 md:py-1">
                                        <input
                                            type="text"
                                            name={`entry_${index}_volume`}
                                            value={row.volume || ''}
                                            onChange={e => updateRow(row.id, 'volume', e.target.value)}
                                            className="block w-full border border-gray-400 dark:border-gray-600 rounded-md text-[9px] md:text-xs py-0.5 px-0.5 md:py-1 md:px-1.5 text-gray-900 dark:text-white bg-transparent placeholder:text-gray-400 focus:ring-red-500 focus:border-red-500"
                                            placeholder="e.g. 1kg"
                                        />
                                    </td>
                                    <td className="px-0.5 py-0.5 md:py-1">
                                        <input
                                            type="number" step="any"
                                            name={`entry_${index}_unit`}
                                            value={row.unit || ''}
                                            onChange={e => updateRow(row.id, 'unit', e.target.value)}
                                            className="block w-full border border-gray-400 dark:border-gray-600 rounded-md text-[9px] md:text-xs py-0.5 px-0.5 md:py-1 md:px-1.5 text-gray-900 dark:text-white bg-transparent placeholder:text-gray-400 focus:ring-red-500 focus:border-red-500"
                                            placeholder="Qty"
                                        />
                                    </td>
                                    <td className="px-0.5 py-0.5 md:py-1">
                                        <input
                                            type="number" step="0.01"
                                            name={`entry_${index}_unitPrice`}
                                            value={row.unitPrice || ''}
                                            onChange={e => updateRow(row.id, 'unitPrice', e.target.value)}
                                            className="block w-full border border-gray-400 dark:border-gray-600 rounded-md text-[9px] md:text-xs py-0.5 px-0.5 md:py-1 md:px-1.5 text-gray-900 dark:text-white bg-transparent placeholder:text-gray-400 focus:ring-red-500 focus:border-red-500"
                                            placeholder="Rate"
                                        />
                                    </td>
                                    <td className="px-0.5 py-0.5 md:py-1">
                                        <input
                                            type="number" step="0.01"
                                            name={`entry_${index}_amount`}
                                            value={row.amount}
                                            onChange={e => updateRow(row.id, 'amount', e.target.value)}
                                            className={clsx("block w-full rounded-md text-[9px] md:text-xs py-0.5 px-0.5 md:py-1 md:px-1.5 font-semibold text-gray-900 dark:text-white bg-transparent focus:ring-red-500 focus:border-red-500", {
                                                "border border-green-500 bg-green-50 dark:bg-green-900/20": !row.isManual && row.unit && row.unitPrice,
                                                "border border-gray-400 dark:border-gray-600": row.isManual || (!row.unit && !row.unitPrice)
                                            })}
                                            placeholder="0.00"
                                            required
                                        />
                                    </td>
                                    <td className="px-1 py-1 md:px-3 md:py-2">
                                        <label htmlFor={`file-${row.id}`} className={clsx("cursor-pointer block p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 text-center", row.image ? "text-green-600" : "text-gray-400")}>
                                            <PhotoIcon className="h-4 w-4 md:h-5 md:w-5 mx-auto" />
                                            <input
                                                id={`file-${row.id}`} type="file"
                                                name={`entry_${index}_image`}
                                                accept="image/*" className="hidden"
                                                onChange={e => {
                                                    const f = e.target.files?.[0];
                                                    if (f) updateRow(row.id, 'image', f);
                                                }}
                                            />
                                        </label>
                                    </td>
                                    <td className="px-1 py-1 md:px-3 md:py-2">
                                        <button type="button" onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-600" disabled={rows.length === 1}>
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-50 dark:bg-zinc-700 text-[10px] md:text-xs font-medium text-gray-700 dark:text-gray-300">
                            <tr>
                                <td colSpan={5} className="px-1 py-1 md:px-3 md:py-2 text-right">Total:</td>
                                <td className="px-1 py-1 md:px-3 md:py-2">
                                    ৳ {rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toFixed(2)}
                                </td>
                                <td colSpan={2}></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="flex justify-between items-center">
                    <button
                        type="button"
                        onClick={addRow}
                        disabled={rows.length >= 20}
                        className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
                    >
                        <PlusIcon className="h-4 w-4" /> Add Row
                    </button>

                    <SubmitButton />
                </div>

                {state?.error && <p className="text-sm text-red-600 mt-2">{state.error}</p>}
                {state?.success && <p className="text-sm text-green-600 mt-2">{state.success}</p>}
            </form>
        </div>
    );
}

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
            {pending ? 'Saving...' : 'Save Expenses'}
        </button>
    );
}
