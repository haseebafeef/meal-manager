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
            <div className="block min-w-full align-middle">
                <div className="rounded-lg bg-gray-50/50 dark:bg-zinc-800/30 p-2 md:pt-0 overflow-x-auto border border-gray-100 dark:border-zinc-700/50">
                    <table className="min-w-full text-gray-900 dark:text-gray-100" style={{ minWidth: '700px' }}>
                        <thead className="border-b border-gray-100 dark:border-gray-700/50">
                            <tr>
                                <th scope="col" className="pl-4 md:pl-6 pr-3 py-3 text-left text-[11px] md:text-sm font-bold tracking-wider text-gray-500 dark:text-gray-400">Date</th>
                                <th scope="col" className="w-full px-3 py-3 text-left text-[11px] md:text-sm font-bold tracking-wider text-gray-500 dark:text-gray-400">Description</th>
                                <th scope="col" className="px-3 py-3 text-right text-[11px] md:text-sm font-bold tracking-wider text-gray-500 dark:text-gray-400">Amount</th>
                                <th scope="col" className="pl-3 pr-4 md:pr-6 py-3 text-left text-[11px] md:text-sm font-bold tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white/50 dark:bg-zinc-800/40 divide-y divide-gray-100 dark:divide-gray-700/50">
                            {transactions.map((tx) => {
                                const isApprover = tx.approverId === user.id;
                                const isRequester = tx.requesterId === user.id;
                                const isAdminAdd = tx.description?.includes('(Admin)');

                                return (
                                    <tr key={tx.id} className={clsx(
                                        "border-b py-3 md:py-4 text-xs md:text-sm last-of-type:border-none duration-200",
                                        {
                                            // Standard view (Requester)
                                            "hover:bg-gray-50 dark:hover:bg-zinc-700/50": isRequester,
                                            // Approver view (Admin/Receiver of request) - Only if not self-request
                                            "bg-purple-50/30 dark:bg-purple-900/10 hover:bg-purple-50/50 dark:hover:bg-purple-900/20": isApprover && !isRequester
                                        }
                                    )}>
                                        <td className="whitespace-nowrap pl-4 md:pl-6 pr-3 py-3 md:py-4 text-gray-900 dark:text-gray-100">
                                            <p>{tx.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}</p>
                                        </td>
                                        <td className="whitespace-normal px-3 py-3 md:py-4 text-gray-500 dark:text-gray-400">
                                            {(() => {
                                                // ... (keep logic same)
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
                                                        <div className="text-gray-900 dark:text-gray-300 font-medium">{mainText}</div>
                                                        <div className="text-[10px] text-gray-400 dark:text-gray-500 font-bold tracking-tight mt-1">
                                                            {subText}
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 font-bold text-gray-900 dark:text-gray-100 text-right">
                                            ৳{tx.amount.toFixed(2)}
                                        </td>
                                        <td className="whitespace-nowrap pl-3 pr-4 md:pr-6 py-4">
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
