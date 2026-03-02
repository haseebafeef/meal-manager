import { PrismaClient } from '@prisma/client';
import { getNowDhaka, getStartOfMonthDhaka } from './app/lib/utils';
import { parseTimeToMinutes } from './app/lib/expenses/utils';
import { getSystemSettings } from './app/lib/settings-actions';
import { SETTINGS_KEYS, RAMADAN_CONFIG } from './app/lib/constants';

const prisma = new PrismaClient();

async function main() {
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

    const isSahriToday = RAMADAN_CONFIG ? (todayMidnightDhaka >= new Date(RAMADAN_CONFIG.START) && todayMidnightDhaka <= new Date(RAMADAN_CONFIG.END)) : false;

    const settings = await getSystemSettings();
    const currentRate = parseFloat(settings[SETTINGS_KEYS.MEAL_RATE]);
    const prevRate = parseFloat(settings[SETTINGS_KEYS.PREV_MEAL_RATE]);

    const lunchCutoffMins = parseTimeToMinutes(settings[SETTINGS_KEYS.LUNCH_CUTOFF]);
    const dinnerCutoffMins = parseTimeToMinutes(settings[SETTINGS_KEYS.DINNER_CUTOFF]);
    const sahriCutoffMins = parseTimeToMinutes(settings[SETTINGS_KEYS.SAHRI_CUTOFF]);

    const currentHour = nowDhaka.getUTCHours();
    const currentMinute = nowDhaka.getUTCMinutes();
    const nowMins = currentHour * 60 + currentMinute;

    const currentMonthKey = `${currentMonthStartUTC.getUTCFullYear()}-${String(currentMonthStartUTC.getUTCMonth() + 1).padStart(2, '0')}`;
    const prevMonthKey = `${prevMonthStartUTC.getUTCFullYear()}-${String(prevMonthStartUTC.getUTCMonth() + 1).padStart(2, '0')}`;

    console.log("Testing SQL aggregation...");

    const sql = `
WITH settings AS (
  SELECT 
    $1::timestamp AS current_month_start,
    $2::timestamp AS prev_month_start,
    $3::timestamp AS prev_month_end,
    $4::timestamp AS today_start,
    $5::timestamp AS end_of_today,
    $6::float AS current_rate,
    $7::float AS prev_rate,
    $8::boolean AS is_sahri_today,
    $9::int AS now_mins,
    $10::int AS lunch_cutoff,
    $11::int AS dinner_cutoff,
    $12::int AS sahri_cutoff,
    $13::text AS current_month_key,
    $14::text AS prev_month_key
),
past_days AS (
  SELECT d.date::date as date
  FROM generate_series(
    (SELECT current_month_start FROM settings),
    (SELECT today_start - interval '1 day' FROM settings),
    '1 day'::interval
  ) d
),
user_active_past_days AS (
  SELECT 
    u.id as user_id, 
    pd.date as date_key,
    COALESCE(
      (SELECT status 
       FROM "UserStatusLog"
       WHERE "userId" = u.id AND "changedAt" <= pd.date + time '23:59:59'
       ORDER BY "changedAt" DESC LIMIT 1),
      -- fallback to initial status mapping logic if missing
      'Active' 
    ) as status
  FROM "User" u
  CROSS JOIN past_days pd
  WHERE pd.date >= u."createdAt"::date
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
      (SELECT status FROM "UserStatusLog" WHERE "userId" = u.id AND "changedAt" <= (SELECT "nowDhaka" FROM (SELECT $15::timestamp as "nowDhaka") t) ORDER BY "changedAt" DESC LIMIT 1),
      'Active'
    ) as status
  FROM "User" u
),
aggregates AS (
  SELECT 
    u.id,
    u.balance,
    u."defaultLunchStatus",
    u."defaultDinnerStatus",
    u."defaultSahriStatus",
    (SELECT SUM("totalCost") FROM "MonthlySnapshot" WHERE "userId" = u.id) as fixed_cost,
    (SELECT count(month) FROM "MonthlySnapshot" WHERE "userId" = u.id AND month = s.prev_month_key) as has_prev_snapshot,
    (SELECT count(month) FROM "MonthlySnapshot" WHERE "userId" = u.id AND month = s.current_month_key) as has_current_snapshot,
    
    -- Prev Month DB Sum
    (SELECT SUM(lunch + dinner + sahri) FROM "MealStatus" WHERE "userId" = u.id AND date >= s.prev_month_start AND date <= s.prev_month_end) as prev_db_sum,
    
    -- Past Month DB Sum (strictly before today)
    (SELECT SUM(lunch + dinner + sahri) FROM "MealStatus" WHERE "userId" = u.id AND date >= s.current_month_start AND date < s.today_start) as past_db_sum,
    
    -- Past DB Count
    (SELECT count(*) FROM "MealStatus" WHERE "userId" = u.id AND date >= s.current_month_start AND date < s.today_start) as past_db_count,

    -- Today Agg
    (SELECT SUM(lunch) as lunch, SUM(dinner) as dinner, SUM(sahri) as sahri FROM "MealStatus" WHERE "userId" = u.id AND date >= s.today_start AND date <= s.end_of_today) as today_agg

  FROM "User" u
  CROSS JOIN settings s
)
-- ... we can pull this together
-- But actually Prisma allows JSON returning or just columns. We will write the full JS-compatible output.
SELECT * FROM aggregates LIMIT 5;
    `;
    
    const res = await prisma.$queryRawUnsafe(sql, 
        currentMonthStartUTC, 
        prevMonthStartUTC, 
        prevMonthEndUTC, 
        todayMidnightDhaka, 
        endOfTodayUTC, 
        currentRate, 
        prevRate, 
        isSahriToday, 
        nowMins, 
        lunchCutoffMins, 
        dinnerCutoffMins, 
        sahriCutoffMins, 
        currentMonthKey, 
        prevMonthKey,
        nowDhaka
    );
    console.log(res);

    prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
