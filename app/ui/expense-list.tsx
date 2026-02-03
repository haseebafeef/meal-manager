import { getExpenses } from "@/app/lib/expense-actions";

type ExpenseItem = Awaited<ReturnType<typeof getExpenses>>[number];

export default async function ExpenseList() {
    const expenses = await getExpenses();

    return (
        <div className="mt-6 flow-root">
            <div className="inline-block min-w-full align-middle">
                <div className="rounded-lg bg-gray-50 p-2 md:pt-0 overflow-x-auto">
                    <table className="min-w-full text-gray-900 dark:text-gray-100">
                        <thead className="rounded-lg text-left text-sm font-normal">
                            <tr>
                                <th className="px-2 py-2 md:px-3 md:py-3 text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400">Date</th>
                                <th className="px-2 py-2 md:px-3 md:py-3 text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400">Item</th>
                                <th className="px-2 py-2 md:px-3 md:py-3 text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400">By</th>
                                <th className="px-2 py-2 md:px-3 md:py-3 text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400">Cost</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-zinc-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {expenses.map((expense: ExpenseItem) => (
                                <tr key={expense.id} className="border-b last:border-none hover:bg-gray-50 dark:hover:bg-zinc-700/50">
                                    <td className="whitespace-nowrap px-2 py-2 md:px-3 md:py-3 text-xs md:text-sm">{expense.date.toLocaleDateString()}</td>
                                    <td className="whitespace-nowrap px-2 py-2 md:px-3 md:py-3 text-xs md:text-sm">{expense.description}</td>
                                    <td className="whitespace-nowrap px-2 py-2 md:px-3 md:py-3 text-xs md:text-sm text-gray-500 dark:text-gray-400">{expense.purchaser.name}</td>
                                    <td className="whitespace-nowrap px-2 py-2 md:px-3 md:py-3 text-xs md:text-sm font-semibold text-gray-900 dark:text-gray-100">৳{expense.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
