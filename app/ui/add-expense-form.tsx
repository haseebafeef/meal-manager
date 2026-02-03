'use client';

import { useActionState, useState, useEffect } from 'react';
import { addBatchExpenses } from '@/app/lib/expense-actions';
import { Button } from './button';
import {
    TrashIcon,
    PlusIcon,
    PhotoIcon
} from '@heroicons/react/24/outline';

type Row = {
    id: number;
    description: string;
    volume: string;
    unit: string;
    unitPrice: string;
    amount: string;
};

export default function AddExpenseForm() {
    const [state, dispatch] = useActionState(addBatchExpenses, { success: '' });
    const [rows, setRows] = useState<Row[]>(() => [
        { id: Date.now(), description: '', volume: '', unit: '', unitPrice: '', amount: '' }
    ]);

    // Reset on success
    useEffect(() => {
        if (state?.success) {
            const t = setTimeout(() => {
                setRows([{ id: Date.now(), description: '', volume: '', unit: '', unitPrice: '', amount: '' }]);
            }, 0);
            return () => clearTimeout(t);
        }
    }, [state?.success]);

    const addRow = () => {
        setRows([...rows, { id: Date.now(), description: '', volume: '', unit: '', unitPrice: '', amount: '' }]);
    };

    const removeRow = (index: number) => {
        if (rows.length === 1) return; // Keep at least one row
        const newRows = [...rows];
        newRows.splice(index, 1);
        setRows(newRows);
    };

    const updateRow = (index: number, field: keyof Row, value: string) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], [field]: value };

        // Auto-calc
        if (field === 'unit' || field === 'unitPrice') {
            const unit = parseFloat(newRows[index].unit) || 0;
            const price = parseFloat(newRows[index].unitPrice) || 0;
            if (unit > 0 && price > 0) {
                newRows[index].amount = (unit * price).toFixed(2);
            }
        }
        setRows(newRows);
    };

    const total = rows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);

    return (
        <form action={dispatch} className="space-y-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2024] p-4 text-gray-900 dark:text-gray-300 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Expenses</h2>
                </div>

                {/* Header */}
                <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 px-1">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-3">Item / Description</div>
                    <div className="col-span-2">Vol</div>
                    <div className="col-span-1">Unit</div>
                    <div className="col-span-2">Rate</div>
                    <div className="col-span-2">Total</div>
                    <div className="col-span-1 text-center">Memo</div>
                </div>

                {/* Rows */}
                <div className="space-y-3 md:space-y-2">
                    {rows.map((row, index) => (
                        <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start md:items-center bg-gray-50 dark:bg-[#2a2d33/0] p-3 md:p-0 rounded-lg md:rounded-none relative group">

                            {/* Row # */}
                            <div className="hidden md:block col-span-1 text-center font-mono text-sm text-gray-500">{index + 1}</div>

                            {/* Mobile Label */}
                            <div className="md:hidden text-xs font-bold text-gray-500 mb-1">Item {index + 1}</div>

                            {/* Description */}
                            <div className="col-span-3">
                                <input
                                    type="text"
                                    name={`entry_${index}_description`}
                                    value={row.description}
                                    onChange={(e) => updateRow(index, 'description', e.target.value)}
                                    className="w-full rounded-lg bg-white dark:bg-[#2a2d33] border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-red-500 focus:ring-red-500 focus:outline-none"
                                    placeholder="Item Name"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-3 md:contents gap-2">
                                {/* Vol (String) */}
                                <div className="col-span-1 md:col-span-2">
                                    <input
                                        type="text"
                                        name={`entry_${index}_volume`}
                                        value={row.volume}
                                        onChange={(e) => updateRow(index, 'volume', e.target.value)}
                                        className="w-full rounded-lg bg-white dark:bg-[#2a2d33] border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-red-500 focus:ring-red-500 focus:outline-none"
                                        placeholder="Vol (e.g. 1kg)"
                                    />
                                </div>

                                {/* Unit (Number) */}
                                <div className="col-span-1 md:col-span-1">
                                    <input
                                        type="number"
                                        step="any"
                                        name={`entry_${index}_unit`}
                                        value={row.unit}
                                        onChange={(e) => updateRow(index, 'unit', e.target.value)}
                                        className="w-full rounded-lg bg-white dark:bg-[#2a2d33] border border-gray-200 dark:border-gray-600 px-2 py-2 text-sm text-gray-900 dark:text-white focus:border-red-500 focus:ring-red-500 focus:outline-none"
                                        placeholder="Qty"
                                    />
                                </div>

                                {/* Rate */}
                                <div className="col-span-1 md:col-span-2">
                                    <input
                                        type="number"
                                        step="any"
                                        name={`entry_${index}_unitPrice`}
                                        value={row.unitPrice}
                                        onChange={(e) => updateRow(index, 'unitPrice', e.target.value)}
                                        className="w-full rounded-lg bg-white dark:bg-[#2a2d33] border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-red-500 focus:ring-red-500 focus:outline-none"
                                        placeholder="Rate / Unit"
                                    />
                                </div>
                            </div>

                            {/* Total */}
                            <div className="col-span-1 md:col-span-2 mt-2 md:mt-0">
                                <input
                                    type="number"
                                    step="any"
                                    name={`entry_${index}_amount`}
                                    value={row.amount}
                                    onChange={(e) => updateRow(index, 'amount', e.target.value)}
                                    className="w-full rounded-lg bg-gray-50 dark:bg-[#2a2d33] border border-gray-200 dark:border-green-900/50 px-3 py-2 text-sm font-bold text-gray-900 dark:text-white focus:border-green-500 focus:ring-green-500 focus:outline-none text-right placeholder-gray-400"
                                    placeholder="0.00"
                                    required
                                />
                            </div>

                            {/* Actions */}
                            <div className="col-span-1 flex items-center justify-end md:justify-center gap-3 mt-2 md:mt-0 border-t md:border-t-0 border-gray-200 dark:border-gray-700 pt-2 md:pt-0">
                                {/* Memo Upload */}
                                <label className="cursor-pointer text-gray-400 hover:text-blue-500 transition-colors" title="Upload Memo">
                                    <input
                                        type="file"
                                        className="hidden"
                                        name={`entry_${index}_image`}
                                        accept="image/*"
                                        onChange={(e) => {
                                            if (e.target.files?.[0]) {
                                                const icon = e.target.parentElement?.querySelector('svg');
                                                if (icon) icon.classList.add('text-blue-500', 'fill-blue-500/10');
                                            }
                                        }}
                                    />
                                    <PhotoIcon className="w-5 h-5" />
                                </label>

                                {/* Delete */}
                                <button
                                    type="button"
                                    onClick={() => removeRow(index)}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                    title="Delete Row"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="mt-6 flex flex-col md:flex-row items-end md:items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4 gap-4">
                    <div className="text-sm font-medium w-full md:w-auto text-left">
                        {state?.error && <span className="text-red-600 block bg-red-50 dark:bg-red-900/20 p-2 rounded">{state.error}</span>}
                        {state?.success && <span className="text-green-600 block bg-green-50 dark:bg-green-900/20 p-2 rounded">{state.success}</span>}
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-gray-500 dark:text-gray-400">Total:</span>
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">৳ {total.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <Button
                    type="button"
                    onClick={addRow}
                    className="bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-gray-300 dark:border-zinc-700 shadow-sm"
                >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Add Row
                </Button>

                <Button className="bg-red-600 hover:bg-red-700 text-white px-8 py-2.5 shadow-md shadow-red-500/20">
                    Save Expenses
                </Button>
            </div>
        </form>
    );
}
