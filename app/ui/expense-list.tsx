import { getExpenses } from "@/app/lib/expense-actions";

type ExpenseItem = Awaited<ReturnType<typeof getExpenses>>[number];

export default async function ExpenseList() {
    const expenses = await getExpenses();

    return (
        <div className="mt-6 flow-root">
            <div className="block min-w-full align-middle">
                <div className="rounded-lg bg-gray-50/50 dark:bg-zinc-800/30 p-2 md:pt-0 overflow-x-auto border border-gray-100 dark:border-zinc-700/50">
                    <table className="min-w-full text-gray-900 dark:text-gray-100" style={{ minWidth: '600px' }}>
                        <thead className="border-b border-gray-100 dark:border-gray-700/50">
                            <tr>
                                <th className="pl-4 md:pl-6 pr-3 py-3 text-left text-[11px] md:text-sm font-bold tracking-wider text-gray-500 dark:text-gray-400">Date</th>
                                <th className="w-full px-3 py-3 text-left text-[11px] md:text-sm font-bold tracking-wider text-gray-500 dark:text-gray-400">Item</th>
                                <th className="px-3 py-3 text-left text-[11px] md:text-sm font-bold tracking-wider text-gray-500 dark:text-gray-400">By</th>
                                <th className="pl-3 pr-4 md:pr-6 py-3 text-right text-[11px] md:text-sm font-bold tracking-wider text-gray-500 dark:text-gray-400">Cost</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white/50 dark:bg-zinc-800/40 divide-y divide-gray-100 dark:divide-gray-700/50">
                            {expenses.map((expense: ExpenseItem) => (
                                <tr key={expense.id} className="border-b last:border-none hover:bg-gray-50 dark:hover:bg-zinc-700/50">
                                    <td className="whitespace-nowrap pl-4 md:pl-6 pr-3 py-2 md:py-3 text-xs md:text-sm">{expense.date.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}</td>
                                    <td className="whitespace-normal px-3 py-2 md:py-3 text-xs md:text-sm">{expense.description}</td>
                                    <td className="whitespace-nowrap px-3 py-2 md:py-3 text-xs md:text-sm text-gray-500 dark:text-gray-400">{expense.purchaser.name}</td>
                                    <td className="whitespace-nowrap pl-3 pr-4 md:pr-6 py-2 md:py-3 text-xs md:text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">৳{expense.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
