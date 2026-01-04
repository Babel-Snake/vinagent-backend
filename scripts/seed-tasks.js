require('dotenv').config();
const { sequelize, User, Task, Winery, Member, Message } = require('../src/models');

async function seedTasks() {
    try {
        console.log('🌱 Seeding Enhanced Task Data...');

        // 1. Ensure Winery
        const [winery] = await Winery.findOrCreate({
            where: { contactPhone: '+15550100' },
            defaults: {
                name: 'Simulator Winery',
                contactEmail: 'sim@example.com',
                settings: { timezone: 'Australia/Sydney' }
            }
        });

        // 2. Ensure Users (Manager & Staff)
        const [manager] = await User.findOrCreate({
            where: { email: 'manager@vinagent.internal' },
            defaults: {
                firebaseUid: 'uid-manager-1',
                displayName: 'Alice Manager',
                role: 'manager',
                wineryId: winery.id
            }
        });

        const [staff] = await User.findOrCreate({
            where: { email: 'staff@vinagent.internal' },
            defaults: {
                firebaseUid: 'uid-staff-1',
                displayName: 'Bob Staff',
                role: 'staff',
                wineryId: winery.id
            }
        });

        const [sommelier] = await User.findOrCreate({
            where: { email: 'somm@vinagent.internal' },
            defaults: {
                firebaseUid: 'uid-somm-1',
                displayName: 'Sarah Sommelier',
                role: 'staff',
                wineryId: winery.id
            }
        });

        console.log('✅ Users ensured');

        // 3. Ensure Members
        const [memberVIP] = await Member.findOrCreate({
            where: { email: 'vip@example.com' },
            defaults: {
                firstName: 'Victoria',
                lastName: 'Vee-Eye-Pee',
                phone: '+15550200',
                wineryId: winery.id,
                status: 'active'
            }
        });

        const [memberNew] = await Member.findOrCreate({
            where: { email: 'newbie@example.com' },
            defaults: {
                firstName: 'Noah',
                lastName: 'Newbie',
                phone: '+15550201',
                wineryId: winery.id,
                status: 'active'
            }
        });

        // 4. Create Diverse Tasks

        const tasksToCreate = [
            // High Priority Booking Request (Unassigned)
            {
                type: 'BOOKING_REQUEST',
                category: 'BOOKING',
                subType: 'BOOKING_NEW',
                status: 'PENDING_REVIEW',
                priority: 'high',
                wineryId: winery.id,
                memberId: memberVIP.id,
                suggestedChannel: 'sms',
                suggestedReplyBody: 'Hi Victoria, I can absolutely book you in for a VIP tasting this Saturday at 2pm. Shall I confirm that?',
                payload: { requestedDate: '2024-12-25', partySize: 4 }
            },
            // Assigned Maintenance Task (Internal)
            {
                type: 'INTERNAL_TASK',
                category: 'OPERATIONS',
                subType: 'OPERATIONS_MAINTENANCE_REQUEST',
                status: 'EXECUTED',
                priority: 'normal',
                wineryId: winery.id,
                assigneeId: manager.id,
                suggestedChannel: 'none',
                payload: { note: 'Cellar door fridge needs servicing.' }
            },
            // Order Issue (Assigned to Staff)
            {
                type: 'ORDER_ISSUE',
                category: 'ORDER',
                subType: 'ORDER_SHIPPING_DELAY',
                status: 'PENDING_REVIEW',
                priority: 'normal',
                wineryId: winery.id,
                memberId: memberNew.id,
                assigneeId: staff.id,
                suggestedChannel: 'email',
                suggestedReplySubject: 'Update on your order #1234',
                suggestedReplyBody: 'Hi Noah, apologies for the delay. Your wine is on its way and will arrive by Tuesday.',
                payload: { orderId: '1234', delayReason: 'Courier logistics' }
            },
            // General Enquiry (Negative Sentiment)
            {
                type: 'GENERAL_QUERY',
                category: 'GENERAL',
                subType: 'GENERAL_PRICING_QUESTION',
                status: 'PENDING_REVIEW',
                sentiment: 'NEGATIVE',
                priority: 'high',
                wineryId: winery.id,
                memberId: memberVIP.id,
                assigneeId: sommelier.id,
                suggestedChannel: 'voice',
                suggestedReplyBody: 'I understand your concern about the price increase. Let me explain the vintage quality...',
                payload: { query: 'Why is the Shiraz so expensive now?' }
            },
            // Approved Booking
            {
                type: 'BOOKING_REQUEST',
                category: 'BOOKING',
                subType: 'BOOKING_CHANGE',
                status: 'APPROVED',
                priority: 'normal',
                wineryId: winery.id,
                memberId: memberNew.id,
                assigneeId: staff.id,
                suggestedChannel: 'sms',
                suggestedReplyBody: 'Done! Moved your booking to 3pm.',
                payload: { originalTime: '1pm', newTime: '3pm' }
            }
        ];

        for (const taskData of tasksToCreate) {
            await Task.create(taskData);
        }

        console.log(`✅ Created ${tasksToCreate.length} varied tasks`);
        console.log('--- Seed Complete ---');
        process.exit(0);

    } catch (err) {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    }
}

seedTasks();
