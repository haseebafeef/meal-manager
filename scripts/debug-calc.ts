// @ts-nocheck
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { startOfMonth } = require('date-fns');

// --- UTILS REPLICATION ---
function getNowDhaka() {
    const now = new Date();
    // Use simple offset for script simplicity if Intl fails in node env without full ICU, 
    // but usually Node has it. Let's stick to Intl as it is more accurate.
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type) => parseInt(parts.find(p => p.type === type)?.value || '0');
    const y = getPart('year');
    const m = getPart('month') - 1;
    const d = getPart('day');
    let h = getPart('hour');
    if (h === 24) h = 0;
    const min = getPart('minute');
    const s = getPart('second');
    return new Date(Date.UTC(y, m, d, h, min, s));
}

function getStartOfMonthDhaka() {
    const nowDhaka = getNowDhaka();
    // Manual start of month if date-fns fails, but date-fns is standard.
    // startOfMonth returns local time if passed local time? 
    // Wait, getNowDhaka returns a Date object that LOOKS like UTC but carries Dhaka Face Value.
    // So startOfMonth(nowDhaka) will return the 1st of that month, keeping the "UTC" face value.
    // checks: 
    // nowDhaka = 2026-02-10T09:54:00.000Z (which represents 9:54 AM Dhaka)
    // startOfMonth(nowDhaka) = 2026-02-01T00:00:00.000Z
    return startOfMonth(nowDhaka);
}

function parseTimeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// --- LOGIC REPLICATION ---
async function debugLogic(userId) {
    console.log("--- STARTING DEBUG LOGIC ---");

    // 1. Setup Dates
    const startOfCurrentMonthDhaka = getStartOfMonthDhaka();
    // Shift -6 hours to get the UTC time that corresponds to 00:00 Dhaka
    const queryStartCurrentMonth = new Date(startOfCurrentMonthDhaka.getTime() - 6 * 60 * 60 * 1000);

    console.log("Dhaka Month Start (Face Value):", startOfCurrentMonthDhaka.toISOString());
    console.log("Query (UTC) Start:", queryStartCurrentMonth.toISOString());

    // 2. Settings
    const settings = await prisma.systemSettings.findMany();
    const settingsMap = new Map(settings.map(s => [s.key, s.value]));
    // Hardcoded keys from constants.ts
    const lunchCutoffStr = settingsMap.get('LUNCH_CUTOFF_TIME') || '11:00';
    const dinnerCutoffStr = settingsMap.get('DINNER_CUTOFF_TIME') || '13:00';
    const lunchCutoffMins = parseTimeToMinutes(lunchCutoffStr);
    const dinnerCutoffMins = parseTimeToMinutes(dinnerCutoffStr);
    console.log(`Cutoffs: L=${lunchCutoffStr} (${lunchCutoffMins}m), D=${dinnerCutoffStr} (${dinnerCutoffMins}m)`);

    // 3. User Data
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { statusLogs: { orderBy: { changedAt: 'asc' } } }
    });
    console.log(`User Defaults: L=${user.defaultLunchStatus}, D=${user.defaultDinnerStatus}, CreatedAt=${user.createdAt?.toISOString()}`);

    // 4. Meal Statuses
    const historyLimit = new Date();
    historyLimit.setMonth(historyLimit.getMonth() - 18);
    const allMeals = await prisma.mealStatus.findMany({
        where: { userId: userId, date: { gte: historyLimit } }
    });
    const mealMap = new Map();
    allMeals.forEach(m => {
        const key = m.date.toISOString().split('T')[0];
        mealMap.set(key, m);
    });
    console.log(`Found ${allMeals.length} total meal records since 18 months ago.`);

    // 5. Current Time
    const nowDhaka = getNowDhaka();
    const currentDay = nowDhaka.getUTCDate();
    const currentHour = nowDhaka.getUTCHours();
    const currentMinute = nowDhaka.getUTCMinutes();
    const nowMins = currentHour * 60 + currentMinute;
    console.log(`Now Dhaka (Face Value): ${nowDhaka.toISOString()} | Day=${currentDay} Time=${currentHour}:${currentMinute} (${nowMins}m)`);

    // 6. Iteration
    const cmStart = new Date(queryStartCurrentMonth);
    const cmDhaka = new Date(cmStart.getTime() + 6 * 60 * 60 * 1000);
    const cmYear = cmDhaka.getFullYear();
    const cmMonth = cmDhaka.getMonth();
    const daysInMonth = new Date(cmYear, cmMonth + 1, 0).getDate();

    let totalPassed = 0;

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
        const targetDate = new Date(Date.UTC(cmYear, cmMonth, dayNum));
        const dateKey = targetDate.toISOString().split('T')[0];
        const status = mealMap.get(dateKey);

        const dayEnd = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1); // 23:59:59.999 UTC of that day

        // Active Logic
        let computedStatus = 'Active';
        if (user?.statusLogs) {
            const activeLogs = user.statusLogs.filter(log => log.changedAt <= dayEnd);
            if (activeLogs.length > 0) {
                computedStatus = activeLogs[activeLogs.length - 1].status;
            }
        }
        let isActive = (computedStatus === 'Active');
        if (user?.createdAt && user.createdAt > dayEnd) isActive = false;

        // Default Logic (Use Defaults if no record and Active)
        let l = 1, d = 1;
        if (status) {
            l = status.lunch; d = status.dinner;
            // console.log(`[${dateKey}] FOUND RECORD: L=${l} D=${d}`);
        } else {
            if (!isActive) {
                l = 0; d = 0;
                // console.log(`[${dateKey}] INACTIVE (No Record)`);
            }
            else {
                l = user.defaultLunchStatus ? 1 : 0;
                d = user.defaultDinnerStatus ? 1 : 0;
                // console.log(`[${dateKey}] DEFAULTING: L=${l} D=${d}`);
            }
        }

        // Passed Logic
        let passedL = 0, passedD = 0;
        let isPast = (dayNum < currentDay);
        let isToday = (dayNum === currentDay);

        if (isPast) {
            passedL = l; passedD = d;
        }
        else if (isToday) {
            if (nowMins >= lunchCutoffMins) passedL = l;
            if (nowMins >= dinnerCutoffMins) passedD = d;
        }

        // Output significant days (Passed > 0 OR Record Exists OR Active)
        // If everything is 0 and inactive, maybe skip log to reduce noise? 
        // No, let's log everything for the current month so we see the gaps.

        let note = "";
        if (status) note = " [RECORD]";
        else if (!isActive) note = " [INACTIVE]";
        else note = " [DEFAULT]";

        if (isPast) note += " [PAST]";
        if (isToday) note += " [TODAY]";

        console.log(`Day ${dayNum} (${dateKey}): L=${l} D=${d} => Passed: L=${passedL} D=${passedD} | Act:${isActive} | ${note}`);

        totalPassed += (passedL + passedD);
    }
    console.log("------------------------------------------------");
    console.log("TOTAL CALCULATED PASSED MEALS:", totalPassed);
}

async function main() {
    try {
        console.log("Finding user 'Md. Haseeb Afeef'...");
        const user = await prisma.user.findFirst({
            where: { name: { contains: 'Haseeb' } }
        });
        if (!user) throw new Error("User not found");
        console.log(`Found: ${user.name}`);

        await debugLogic(user.id);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
