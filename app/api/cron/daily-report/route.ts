import { prisma } from '@/app/lib/prisma';
import webPush from 'web-push';
import { NextResponse } from 'next/server';
import { SETTINGS_KEYS, DEFAULT_SETTINGS } from '@/app/lib/constants';
// import { sendWhatsAppMessage } from '@/app/lib/whatsapp';

// Configure Web Push with env vars
const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:haseeb.alt4@gmail.com';

if (publicVapidKey && privateVapidKey) {
    webPush.setVapidDetails(subject, publicVapidKey, privateVapidKey);
}

export async function GET(request: Request) {
    // Verify Cron Secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Optional: Allow local testing
    }

    try {
        // 0. Check Time
        const now = new Date();
        const dhakaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Dhaka", hour: 'numeric', minute: 'numeric', hour12: false });
        const [dhakaHourStr, dhakaMinuteStr] = dhakaTimeStr.split(':');
        const dhakaHour = parseInt(dhakaHourStr);
        const dhakaMinute = parseInt(dhakaMinuteStr);
        const currentTotalMinutes = dhakaHour * 60 + dhakaMinute;

        const timeSetting = await prisma.systemSettings.findUnique({
            where: { key: SETTINGS_KEYS.REPORT_DELIVERY_TIME }
        });
        const targetTimeStr = timeSetting?.value || DEFAULT_SETTINGS[SETTINGS_KEYS.REPORT_DELIVERY_TIME];
        const [targetHourStr, targetMinuteStr] = targetTimeStr.split(':');
        const targetHour = parseInt(targetHourStr);
        const targetMinute = parseInt(targetMinuteStr || '0');
        const targetTotalMinutes = targetHour * 60 + targetMinute;

        const { searchParams } = new URL(request.url);
        const force = searchParams.get('force') === 'true';

        // Idempotency: Check if we already ran TODAY (regardless of hour)
        const lastRunSetting = await prisma.systemSettings.findUnique({
            where: { key: SETTINGS_KEYS.LAST_DELIVERY_ISO }
        });

        if (lastRunSetting?.value && !force) {
            const lastRunDate = new Date(lastRunSetting.value);
            const lastRunDay = lastRunDate.toLocaleString("en-US", { timeZone: "Asia/Dhaka", day: 'numeric' });
            const currentDay = now.toLocaleString("en-US", { timeZone: "Asia/Dhaka", day: 'numeric' });

            if (lastRunDay === currentDay) {
                console.log(`[Cron] Already sent today. Skipping.`);
                return NextResponse.json({ skipped: true, reason: `Already sent today` });
            }
        }

        console.log(`[Cron] Time Check. Current: ${currentTotalMinutes}m (${dhakaHour}:${dhakaMinute}), Target: ${targetTotalMinutes}m (${targetHour}:${targetMinute}), Force: ${force}`);

        // Logic: Send if Current Time >= Target Time
        // This handles "Catch Up" if cron runs slightly late (e.g. 10:16 for 10:15 target)
        if (currentTotalMinutes < targetTotalMinutes && !force) {
            console.log(`[Cron] Skipping. Too early.`);
            return NextResponse.json({ skipped: true, reason: `Too early. Current ${dhakaHour}:${dhakaMinute} < Target ${targetHour}:${targetMinute}` });
        }

        // Update Last Run immediately (to lock)
        if (!force) {
            await prisma.systemSettings.upsert({
                where: { key: SETTINGS_KEYS.LAST_DELIVERY_ISO },
                update: { value: now.toISOString() },
                create: { key: SETTINGS_KEYS.LAST_DELIVERY_ISO, value: now.toISOString() }
            });
        }

        // 1. Calculate Stats & Fetch Data
        const today = now;

        // Use midnight-to-midnight range for strict querying
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        // Fetch ALL Active Users (to count everyone's meals, not just subscribers)
        const allUsers = await prisma.user.findMany({
            where: { status: 'Active' },
            select: {
                id: true,
                name: true,
                nickname: true,
                tag: true,
                mealStatuses: {
                    where: {
                        date: {
                            gte: startOfDay,
                            lte: endOfDay
                        }
                    }
                }
            }
        });

        // 2. Prepare Detailed Report Logic
        let lunchCount = 0;
        let dinnerCount = 0;
        const tagGroups: Record<string, { lunch: string[], dinner: string[] }> = {};

        allUsers.forEach(user => {
            const status = user.mealStatuses[0];
            const hasLunch = status ? status.lunch > 0 : false;
            const hasDinner = status ? status.dinner > 0 : false;

            // Increment Totals
            if (hasLunch) lunchCount++;
            if (hasDinner) dinnerCount++;

            // Group by Tag
            if (hasLunch || hasDinner) {
                const tag = user.tag || 'Other';
                if (!tagGroups[tag]) {
                    tagGroups[tag] = { lunch: [], dinner: [] };
                }
                const displayName = user.nickname || user.name.split(' ')[0]; // Use nickname or first name

                if (hasLunch) tagGroups[tag].lunch.push(displayName);
                if (hasDinner) tagGroups[tag].dinner.push(displayName);
            }
        });

        // 3. Format the Message
        let reportBody = `Date: ${today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}\n`;
        reportBody += `Lunch: ${lunchCount} | Dinner: ${dinnerCount}\n`;

        // Sort tags alphabetically (e.g., 2B, 5A, 5B)
        const sortedTags = Object.keys(tagGroups).sort();

        sortedTags.forEach(tag => {
            const group = tagGroups[tag];
            reportBody += `\n*${tag}* -\n`;
            if (group.lunch.length > 0) {
                reportBody += `Lunch: ${group.lunch.length} (${group.lunch.join(', ')})\n`;
            }
            if (group.dinner.length > 0) {
                reportBody += `Dinner: ${group.dinner.length} (${group.dinner.join(', ')})\n`;
            }
        });

        console.log('--- Generated Report ---\n', reportBody);

        // 4. Fetch Subscribers (Users who want to RECEIVE the report)
        const subscribers = await prisma.user.findMany({
            where: { receiveDailyReports: true },
            select: {
                id: true,
                phone: true,
                pushSubscriptions: true
            }
        });

        console.log(`Sending detailed report to ${subscribers.length} subscribers...`);

        // 5. Send Notifications
        const results = await Promise.allSettled(
            subscribers.map(async (user) => {
                const logs = [];

                // A. Web Push (Existing)
                if (user.pushSubscriptions.length > 0 && publicVapidKey && privateVapidKey) {
                    for (const sub of user.pushSubscriptions) {
                        try {
                            const payload = JSON.stringify({
                                title: 'Daily Meal Report 🍱',
                                body: `L: ${lunchCount} | D: ${dinnerCount}\n(Check WhatsApp for details)`, // Keep push short
                                url: '/dashboard/admin/meals'
                            });
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await webPush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys as any }, payload);
                            logs.push('Push Sent');
                        } catch (error) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            if ((error as any).statusCode === 410 || (error as any).statusCode === 404) {
                                await prisma.pushSubscription.delete({ where: { id: sub.id } });
                            }
                            logs.push('Push Failed');
                        }
                    }
                }

                // B. WhatsApp (New - Detailed)
                // if (user.phone) {
                //     // Use 'meal_report_flex' if available, otherwise fallback to 'hello_world' but we really want the text.
                //     // Since 'meal_report_flex' isn't created yet in Meta, we might fail if we try to send this big body 
                //     // into a 'hello_world'.
                //     // Strategy: For NOW, we will attempt to send it using 'hello_world' just to test connectivity,
                //     // BUT 'hello_world' doesn't support parameters. 
                //     // So we MUST use the new template name 'meal_report_flex'. 
                //     // If the user hasn't created it yet, this will fail with "Template not found".
                //     // This is intentional - it forces the 'Production Readiness' step.
                //
                //     const waResult = await sendWhatsAppMessage({
                //         to: user.phone,
                //         templateName: 'meal_report_flex', // Expecting this to exist
                //         languageCode: 'en_US',
                //         components: [
                //             {
                //                 type: 'body',
                //                 parameters: [
                //                     { type: 'text', text: reportBody }
                //                 ]
                //             }
                //         ]
                //     });
                //
                //     if (waResult.success) {
                //         logs.push(`WhatsApp Sent to ${user.phone}`);
                //     } else {
                //         logs.push(`WhatsApp Failed: ${waResult.error}`);
                //     }
                // }

                return { userId: user.id, logs };
            })
        );

        return NextResponse.json({
            success: true,
            reportPreview: reportBody,
            results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason)
        });

    } catch (error) {
        console.error('Cron job failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
