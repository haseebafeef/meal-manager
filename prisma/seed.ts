import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    // 1. Create Users
    const passwordHash = await bcrypt.hash('123456', 10);

    const usersData = [
        { name: 'User 1', email: 'user1@example.com', phone: '01700000001', password: passwordHash, balance: 500 },
        { name: 'User 2', email: 'user2@example.com', phone: '01700000002', password: passwordHash, balance: 250 },
        { name: 'User 3', email: 'user3@example.com', phone: '01700000003', password: passwordHash, balance: 0 },
        { name: 'User 4', email: 'user4@example.com', phone: '01700000004', password: passwordHash, balance: 1000 },
    ];

    const users = [];
    for (const u of usersData) {
        const user = await prisma.user.upsert({
            where: { email: u.email },
            update: {},
            create: u,
        });
        users.push(user);
        console.log(`Created user: ${user.name}`);
    }

    // 2. Create Transactions
    // User 1 requests 100 from User 2 (Approved)
    await prisma.transaction.create({
        data: {
            amount: 100,
            requesterId: users[0].id,
            approverId: users[1].id,
            status: 'APPROVED',
            createdAt: new Date('2026-01-28T10:00:00Z'),
        },
    });

    // User 3 requests 500 from User 4 (Pending)
    await prisma.transaction.create({
        data: {
            amount: 500,
            requesterId: users[2].id,
            approverId: users[3].id,
            status: 'PENDING',
            createdAt: new Date(),
        },
    });

    // User 2 requests 50 from User 1 (Declined)
    await prisma.transaction.create({
        data: {
            amount: 50,
            requesterId: users[1].id,
            approverId: users[0].id,
            status: 'DECLINED',
            createdAt: new Date('2026-01-29T15:30:00Z'),
        }
    });

    console.log('✅ Transactions seeded.');

    // 3. Create Expenses
    await prisma.expense.create({
        data: {
            description: 'Rice (25kg)',
            amount: 1500,
            purchaserId: users[3].id,
            date: new Date('2026-01-25'),
        }
    });

    await prisma.expense.create({
        data: {
            description: 'Oil & Spices',
            amount: 450,
            purchaserId: users[0].id,
            date: new Date('2026-01-28'),
        }
    });

    console.log('✅ Expenses seeded.');

    // 4. Meal Status (User 4 turns off Lunch tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    await prisma.mealStatus.create({
        data: {
            userId: users[3].id,
            date: tomorrow,
            lunch: 0,
            dinner: 1
        }
    });

    console.log('✅ Meal Status seeded.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
