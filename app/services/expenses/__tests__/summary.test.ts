/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getBatchUserSummaries } from '@/app/services/expenses/summary';
import { prisma } from '@/app/lib/prisma';
import * as settingsActions from '@/app/lib/settings-actions';
import * as utils from '@/app/lib/utils';

// We just need to mock the external dependencies of `summary.ts`
vi.mock('@/app/lib/settings-actions', () => ({
    getSystemSettings: vi.fn(),
}));

vi.mock('@/app/lib/utils', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual as any,
        getNowDhaka: vi.fn(),
        getStartOfMonthDhaka: vi.fn(),
    };
});

describe('getBatchUserSummaries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Default System Settings to avoid NaN
        vi.mocked(settingsActions.getSystemSettings).mockResolvedValue({
            CURRENT_MEAL_RATE: '65',
            PREVIOUS_MEAL_RATE: '60',
            LUNCH_CUTOFF_TIME: '10:00',
            DINNER_CUTOFF_TIME: '16:00',
            SAHRI_CUTOFF_TIME: '22:00',
        });

        // Lock time to a predictable date (e.g. 1st of month at 8am)
        const mockNow = new Date('2026-03-01T08:00:00Z');
        vi.mocked(utils.getNowDhaka).mockReturnValue(mockNow);
        
        const mockMonthStart = new Date('2026-03-01T00:00:00Z');
        vi.mocked(utils.getStartOfMonthDhaka).mockReturnValue(mockMonthStart);
    });

    it('calculates correct remaining balance for active user with no snapshots', async () => {
        // Mock the raw postgres aggregation returning a single user row
        const mockRawUserRow = {
            id: 'user-1',
            balance: 500, // starting balance
            defaultLunchStatus: true,
            defaultDinnerStatus: true,
            defaultSahriStatus: false,
            fixed_cost: 0,
            has_prev_snapshot: false,
            has_current_snapshot: false,
            prev_db_sum: 5, // 5 meals from prev month at PREV_MEAL_RATE (60)
            past_db_sum: 2, // 2 meals past in current month at MEAL_RATE (65)
            past_db_count: 1, // 1 past day
            today_lunch: 0,
            today_dinner: 0,
            today_sahri: 0,
            has_today_meal: false,
            active_days_count: 2, // 2 active days, so 1 missing day
            today_status: 'Active',
        };

        // TypeScript forces us to expect any since $queryRaw is dynamic
        (prisma.$queryRaw as any).mockResolvedValue([mockRawUserRow]);

        const result = await getBatchUserSummaries();

        // Let's manually compute expected:
        // prev month cost = 5 * 60 = 300
        // missing days = 2 (active) - 1 (past_db_count) = 1 day. 
        // 1 missing day * (1 lunch + 1 dinner) = 2 default meals.
        // past + pastProj = 2 (past_db_sum) + 2 (pastProj) = 4 meals at 65 = 260
        // today items (at 8am, cutoff not reached) so 0 cost for today yet.
        // Total cost = 300 + 260 = 560
        // Remaining Balance = 500 - 560 = -60

        expect(result.get('user-1').remainingBalance).toBe(-60);
    });

    it('calculates correctly when user has current snapshot', async () => {
        const mockRawUserRow = {
            id: 'user-2',
            balance: 1000,
            has_prev_snapshot: false,
            has_current_snapshot: true,
            fixed_cost: 300, // Should use the fixed baseline if snapshot exists
            prev_db_sum: 2, // 2 * 60 = 120
        };

        (prisma.$queryRaw as any).mockResolvedValue([mockRawUserRow]);

        const result = await getBatchUserSummaries();

        // Total Cost: fixed_cost (300) + prev_db_sum (120) = 420
        // 1000 - 420 = 580
        expect(result.get('user-2').remainingBalance).toBe(580);
    });

    it('factors in today meals if cutoff passed', async () => {
        // Assume default meals are true. 
        // Time is 11:00, lunch cutoff (10:00) passed.
        vi.mocked(utils.getNowDhaka).mockReturnValue(new Date('2026-03-01T11:00:00Z'));
        
        const mockRawUserRow = {
            id: 'user-3',
            balance: 200,
            defaultLunchStatus: true,
            defaultDinnerStatus: false,
            defaultSahriStatus: false,
            fixed_cost: 0,
            has_prev_snapshot: true,
            has_current_snapshot: false,
            prev_db_sum: 0,
            past_db_sum: 0,
            past_db_count: 0,
            today_lunch: 1, // User actually booked it
            today_dinner: 0,
            today_sahri: 0,
            has_today_meal: true,
            active_days_count: 0,
            today_status: 'Active',
        };

        (prisma.$queryRaw as any).mockResolvedValue([mockRawUserRow]);

        const result = await getBatchUserSummaries();

        // 11:00 is > 10:00, so lunch cutoff passed, adds 1 meal cost.
        // Cost = 1 * 65 = 65
        // Balance = 200 - 65 = 135
        expect(result.get('user-3').remainingBalance).toBe(135);
    });
});
