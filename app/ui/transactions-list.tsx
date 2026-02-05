import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import clsx from 'clsx';
// import { format } from 'date-fns'; 
import { approveRequest, declineRequest } from '@/app/lib/transaction-actions';



export default async function TransactionsList() {
    const session = await auth();
    if (!session?.user?.email) return null;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return null;

    const transactions = await prisma.transaction.findMany({
        where: {
            AND: [
                {
                    OR: [
                        { requesterId: user.id },
                        { approverId: user.id },
                    ]
                },
                {
                    createdAt: {
                        gte: new Date(new Date().setDate(new Date().getDate() - 25))
                    }
                }
            ]
        },
        include: {
            requester: { select: { name: true } },
            approver: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    return (
        <div className="mt-6 flow-root">
            <div className="inline-block min-w-full align-middle">
                <div className="rounded-lg bg-gray-50 p-2 md:pt-0 overflow-x-auto">
                    <table className="min-w-full text-gray-900 dark:text-gray-100">
                        <thead className="rounded-lg text-left text-sm font-normal">
                            <tr>
                                <th scope="col" className="px-2 py-3 md:px-4 md:py-5 text-xs md:text-sm font-medium sm:pl-6 text-gray-500 dark:text-gray-400">Date</th>
                                <th scope="col" className="px-2 py-3 md:px-3 md:py-5 text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400">Description</th>
                                <th scope="col" className="px-2 py-3 md:px-3 md:py-5 text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400">Amount</th>
                                <th scope="col" className="px-2 py-3 md:px-3 md:py-5 text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-zinc-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {transactions.map((tx) => {
                                const isApprover = tx.approverId === user.id;
                                const isRequester = tx.requesterId === user.id;
                                const isAdminAdd = tx.description?.includes('(Admin)');

                                return (
                                    <tr key={tx.id} className={clsx(
                                        "w-full border-b py-2 md:py-3 text-xs md:text-sm last-of-type:border-none duration-200",
                                        {
                                            // Standard view (Requester)
                                            "hover:bg-gray-50 dark:hover:bg-zinc-700/50": isRequester,
                                            // Approver view (Admin/Receiver of request) - Only if not self-request
                                            "bg-purple-50/30 dark:bg-purple-900/10 hover:bg-purple-50/50 dark:hover:bg-purple-900/20": isApprover && !isRequester
                                        }
                                    )}>
                                        <td className="whitespace-nowrap py-2 pl-3 md:py-3 md:pl-6 pr-2 md:pr-3 text-gray-900 dark:text-gray-100">
                                            <p>{tx.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}</p>
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-2 md:px-3 md:py-3 text-gray-500 dark:text-gray-400">
                                            {(() => {
                                                let mainText = "";
                                                let subText = "";
                                                const method = tx.paymentMethod || "Cash";

                                                if (isApprover) {
                                                    // User is the one who approved/added the money (Admin or Receiver)
                                                    if (isAdminAdd) {
                                                        // If description is the new persistent format
                                                        if (tx.description && (tx.description.startsWith("Added to") || tx.description.startsWith("Added by Self"))) {
                                                            mainText = tx.description;
                                                        } else {
                                                            // Legacy format fallback
                                                            mainText = `Added to ${tx.requester.name} by ${tx.approver.name} (Admin)`;
                                                        }
                                                        subText = `${method} payment`;
                                                    } else {
                                                        if (isRequester) {
                                                            mainText = "Added by Self";
                                                        } else {
                                                            const reqName = tx.requester.name;
                                                            mainText = `Received from ${reqName}`;
                                                        }
                                                        subText = `via ${method}`;
                                                    }
                                                } else {
                                                    // User is the one who requested/received the money
                                                    if (isAdminAdd) {
                                                        const desc = tx.description || "Admin Transaction";
                                                        mainText = desc; // Keep original "Added by ... (Admin)"
                                                        subText = `${method} Payment`;
                                                    } else {
                                                        const appName = tx.approver.name;
                                                        // Check if original description has " (via ...)" to strip it for cleaner "Sent to"
                                                        let desc = tx.description || "";
                                                        if (desc.includes(' (via ')) desc = desc.split(' (via ')[0];

                                                        // If original description was just auto-gen "Sent to...", use that or rebuild
                                                        if (desc.startsWith("Sent to")) {
                                                            mainText = desc;
                                                        } else {
                                                            mainText = `Sent to ${appName}`;
                                                        }
                                                        subText = `via ${method}`;
                                                    }
                                                }

                                                return (
                                                    <>
                                                        <div className="text-gray-900 dark:text-gray-300">{mainText}</div>
                                                        <div className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                                                            {subText}
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-gray-900 dark:text-gray-100">
                                            ৳{tx.amount.toFixed(2)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3">
                                            <span className={clsx(
                                                'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
                                                {
                                                    'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300': tx.status === 'PENDING',
                                                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': tx.status === 'APPROVED',
                                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': tx.status === 'DECLINED',
                                                }
                                            )}>
                                                {tx.status}
                                            </span>
                                            {isApprover && tx.status === 'PENDING' && (
                                                <div className="flex gap-2 mt-2">
                                                    <form action={async (formData) => { 'use server'; await approveRequest(formData); }}>
                                                        <input type="hidden" name="id" value={tx.id} />
                                                        <button className="px-3 py-1.5 md:px-2 md:py-1 text-sm md:text-xs bg-green-50 text-green-600 border border-green-200 rounded hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/40 font-medium">Accept</button>
                                                    </form>
                                                    <form action={async (formData) => { 'use server'; await declineRequest(formData); }}>
                                                        <input type="hidden" name="id" value={tx.id} />
                                                        <button className="px-3 py-1.5 md:px-2 md:py-1 text-sm md:text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/40 font-medium">Decline</button>
                                                    </form>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {transactions.length === 0 && (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">No recent transactions.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
