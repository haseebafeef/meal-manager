import { prisma } from '@/app/lib/prisma';
import { getNowDhaka, getStartOfMonthDhaka } from '@/app/lib/utils';
import { parseTimeToMinutes, formatMonthKey } from '@/app/lib/expenses/utils';
import { getSystemSettings } from '@/app/lib/settings-actions';
import { SETTINGS_KEYS, RAMADAN_CONFIG } from '@/app/lib/constants';

export async function getBatchUserSummaries() {
    const nowDhaka = getNowDhaka();
    const currentMonthStartDhaka = getStartOfMonthDhaka();
    const currentMonthStartUTC = new Date(currentMonthStartDhaka.getTime() - 6 * 60 * 60 * 1000);

    const todayMidnightDhaka = new Date(Date.UTC(nowDhaka.getFullYear(), nowDhaka.getMonth(), nowDhaka.getDate()));
    const endOfTodayUTC = todayMidnightDhaka;

    const prevMonthStartDhaka = new Date(currentMonthStartDhaka);
    prevMonthStartDhaka.setMonth(prevMonthStartDhaka.getMonth() - 1);
    const prevMonthStartUTC = new Date(prevMonthStartDhaka.getTime() - 6 * 60 * 60 * 1000);
    const prevMonthEndDhaka = new Date(currentMonthStartDhaka);
    prevMonthEndDhaka.setDate(0);
    const prevMonthEndUTC = new Date(prevMonthEndDhaka.getTime() - 6 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);

    const settingsRecord: Record<string, string> = await getSystemSettings();
    const settingsMap = new Map<string, string>(Object.entries(settingsRecord));

    const currentRate = parseFloat(settingsMap.get(SETTINGS_KEYS.MEAL_RATE) || '65');
    const prevRate = parseFloat(settingsMap.get(SETTINGS_KEYS.PREV_MEAL_RATE) || '65');

    const lunchCutoffMins = parseTimeToMinutes(settingsMap.get(SETTINGS_KEYS.LUNCH_CUTOFF) || '10:00');
    const dinnerCutoffMins = parseTimeToMinutes(settingsMap.get(SETTINGS_KEYS.DINNER_CUTOFF) || '16:00');
    const sahriCutoffMins = parseTimeToMinutes(settingsMap.get(SETTINGS_KEYS.SAHRI_CUTOFF) || '22:00');

    const currentHour = nowDhaka.getUTCHours();
    const currentMinute = nowDhaka.getUTCMinutes();
    const nowMins = currentHour * 60 + currentMinute;

    const isSahriToday = RAMADAN_CONFIG ? (todayMidnightDhaka >= new Date(RAMADAN_CONFIG.START) && todayMidnightDhaka <= new Date(RAMADAN_CONFIG.END)) : false;

    const currentMonthKey = formatMonthKey(currentMonthStartUTC);
    const prevMonthKey = formatMonthKey(prevMonthStartUTC);

    const todayStartString = new Date(todayMidnightDhaka.getTime() - 6 * 60 * 60 * 1000).toISOString();

    // We compute the raw data directly in postgres
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultsRaw: any[] = await prisma.$queryRaw`
        WITH settings AS (
            SELECT 
                ${currentMonthStartUTC}::timestamp AS current_month_start,
                ${prevMonthStartUTC}::timestamp AS prev_month_start,
                ${prevMonthEndUTC}::timestamp AS prev_month_end,
                ${todayStartString}::timestamp AS today_start,
                ${endOfTodayUTC}::timestamp AS end_of_today,
                ${nowDhaka}::timestamp AS now_dhaka
        ),
        past_days AS (
            SELECT d.date::date as date_key
            FROM generate_series(
                (SELECT current_month_start FROM settings),
                (SELECT today_start - interval '1 day' FROM settings),
                '1 day'::interval
            ) d
        ),
        target_users AS (
            SELECT id, balance, "defaultLunchStatus", "defaultDinnerStatus", "defaultSahriStatus", "createdAt"
            FROM "User" 
            WHERE status != 'Deleted' -- only compute for active/inactive users, avoiding massive dead users list
        ),
        user_active_past_days AS (
            SELECT 
                u.id as user_id, 
                pd.date_key,
                COALESCE(
                    (SELECT status 
                     FROM "UserStatusLog"
                     WHERE "userId" = u.id AND "changedAt" <= pd.date_key + time '23:59:59'
                     ORDER BY "changedAt" DESC LIMIT 1),
                    'Active' 
                ) as status
            FROM target_users u
            CROSS JOIN past_days pd
            WHERE pd.date_key >= u."createdAt"::date
        ),
        active_days_count AS (
            SELECT user_id, count(*) as active_days
            FROM user_active_past_days
            WHERE status = 'Active'
            GROUP BY user_id
        ),
        today_status AS (
            SELECT 
                u.id as user_id,
                COALESCE(
                    (SELECT status FROM "UserStatusLog" WHERE "userId" = u.id AND "changedAt" <= (SELECT now_dhaka FROM settings) ORDER BY "changedAt" DESC LIMIT 1),
                    'Active'
                ) as status
            FROM target_users u
        )
        SELECT 
            u.id,
            u.balance,
            u."defaultLunchStatus",
            u."defaultDinnerStatus",
            u."defaultSahriStatus",
            COALESCE((SELECT SUM("totalCost") FROM "MonthlySnapshot" WHERE "userId" = u.id), 0) as fixed_cost,
            EXISTS(SELECT 1 FROM "MonthlySnapshot" WHERE "userId" = u.id AND month = ${prevMonthKey}) as has_prev_snapshot,
            EXISTS(SELECT 1 FROM "MonthlySnapshot" WHERE "userId" = u.id AND month = ${currentMonthKey}) as has_current_snapshot,
            
            COALESCE((SELECT SUM(lunch + dinner + sahri) FROM "MealStatus" WHERE "userId" = u.id AND date >= (SELECT prev_month_start FROM settings) AND date <= (SELECT prev_month_end FROM settings)), 0) as prev_db_sum,
            
            COALESCE((SELECT SUM(lunch + dinner + sahri) FROM "MealStatus" WHERE "userId" = u.id AND date >= (SELECT current_month_start FROM settings) AND date < (SELECT today_start FROM settings)), 0) as past_db_sum,
            
            COALESCE((SELECT count(*) FROM "MealStatus" WHERE "userId" = u.id AND date >= (SELECT current_month_start FROM settings) AND date < (SELECT today_start FROM settings)), 0) as past_db_count,

            COALESCE((SELECT lunch FROM "MealStatus" WHERE "userId" = u.id AND date >= (SELECT today_start FROM settings) AND date <= (SELECT end_of_today FROM settings) LIMIT 1), 0) as today_lunch,
            COALESCE((SELECT dinner FROM "MealStatus" WHERE "userId" = u.id AND date >= (SELECT today_start FROM settings) AND date <= (SELECT end_of_today FROM settings) LIMIT 1), 0) as today_dinner,
            COALESCE((SELECT sahri FROM "MealStatus" WHERE "userId" = u.id AND date >= (SELECT today_start FROM settings) AND date <= (SELECT end_of_today FROM settings) LIMIT 1), 0) as today_sahri,
            COALESCE((SELECT 1 FROM "MealStatus" WHERE "userId" = u.id AND date >= (SELECT today_start FROM settings) AND date <= (SELECT end_of_today FROM settings) LIMIT 1), 0) as has_today_meal,

            COALESCE(adc.active_days, 0) as active_days_count,
            COALESCE(ts.status, 'Active') as today_status

        FROM target_users u
        LEFT JOIN active_days_count adc ON adc.user_id = u.id
        LEFT JOIN today_status ts ON ts.user_id = u.id;
    `;

    const resultsMap = new Map();

    for (const row of resultsRaw) {
        let totalCost = row.fixed_cost;

        if (!row.has_prev_snapshot) {
            totalCost += Number(row.prev_db_sum) * prevRate;
        }

        if (!row.has_current_snapshot) {
            const defTotal = (row.defaultLunchStatus ? 1 : 0) + (row.defaultDinnerStatus ? 1 : 0) + (row.defaultSahriStatus ? 1 : 0);

            const missingDays = Math.max(0, Number(row.active_days_count) - Number(row.past_db_count));
            const pastProj = missingDays * defTotal;

            let todayCostItems = 0;
            if (row.today_status === 'Active') {
                const tL = row.has_today_meal ? row.today_lunch : (row.defaultLunchStatus ? 1 : 0);
                const tD = row.has_today_meal ? row.today_dinner : (row.defaultDinnerStatus ? 1 : 0);
                const tS = row.has_today_meal ? row.today_sahri : (isSahriToday && row.defaultSahriStatus ? 1 : 0);

                if (nowMins >= lunchCutoffMins) todayCostItems += tL;
                if (nowMins >= dinnerCutoffMins) todayCostItems += tD;
                if (nowMins >= sahriCutoffMins) todayCostItems += tS;
            } else if (row.has_today_meal) {
                if (nowMins >= lunchCutoffMins) todayCostItems += row.today_lunch;
                if (nowMins >= dinnerCutoffMins) todayCostItems += row.today_dinner;
                if (nowMins >= sahriCutoffMins) todayCostItems += row.today_sahri;
            }

            totalCost += (Number(row.past_db_sum) + pastProj + todayCostItems) * currentRate;
        }

        resultsMap.set(row.id, {
            remainingBalance: Number(row.balance) - totalCost
        });
    }

    return resultsMap;
}
