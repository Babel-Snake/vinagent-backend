require('dotenv').config();
const { User, Task, Winery, Member } = require('../src/models');

async function seedTasks() {
    try {
        console.log('Seeding task data...');

        // 1. Ensure Winery (align with seed-users.js)
        const [winery] = await Winery.findOrCreate({
            where: { id: 1 },
            defaults: {
                name: 'Demo Winery',
                contactEmail: 'demo@example.com',
                contactPhone: '+15550100',
                timeZone: 'Australia/Adelaide'
            }
        });

        // 2. Ensure Users (Manager & Staff)
        const [manager] = await User.findOrCreate({
            where: { email: 'manager@vinagent.com' },
            defaults: {
                firebaseUid: 'uid-manager-1',
                displayName: 'Mike Manager',
                role: 'manager',
                wineryId: winery.id
            }
        });

        const [staffA] = await User.findOrCreate({
            where: { email: 'sarah.w1@vinagent.internal' },
            defaults: {
                firebaseUid: 'uid-staff-1',
                displayName: 'Sarah',
                role: 'staff',
                wineryId: winery.id
            }
        });

        const [staffB] = await User.findOrCreate({
            where: { email: 'tom.w1@vinagent.internal' },
            defaults: {
                firebaseUid: 'uid-staff-2',
                displayName: 'Tom',
                role: 'staff',
                wineryId: winery.id
            }
        });

        console.log('Users ensured');

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

        const [memberGuest] = await Member.findOrCreate({
            where: { email: 'guest@example.com' },
            defaults: {
                firstName: 'Gina',
                lastName: 'Guest',
                phone: '+15550202',
                wineryId: winery.id,
                status: 'active'
            }
        });

        // 4. Create Diverse Tasks
        const tasksToCreate = [
            // Booking: new request, unassigned
            {
                type: 'BOOKING_NEW',
                category: 'BOOKING',
                subType: 'BOOKING_NEW',
                status: 'PENDING_REVIEW',
                priority: 'high',
                sentiment: 'POSITIVE',
                customerType: 'MEMBER',
                wineryId: winery.id,
                memberId: memberVIP.id,
                suggestedChannel: 'sms',
                suggestedReplyBody: 'Happy to book you in for a VIP tasting on Saturday at 2pm. Confirm?',
                payload: { date: '2024-12-25', time: '2pm', pax: 4 }
            },
            // Booking: change, approved, assigned
            {
                type: 'BOOKING_CHANGE',
                category: 'BOOKING',
                subType: 'BOOKING_CHANGE',
                status: 'APPROVED',
                priority: 'normal',
                customerType: 'MEMBER',
                wineryId: winery.id,
                memberId: memberNew.id,
                assigneeId: staffA.id,
                createdBy: staffA.id,
                updatedBy: staffA.id,
                suggestedChannel: 'sms',
                suggestedReplyBody: 'Done! Moved your booking to 3pm.',
                payload: { originalTime: '1pm', newTime: '3pm' }
            },
            // Account: address change awaiting member action
            {
                type: 'ACCOUNT_ADDRESS_CHANGE',
                category: 'ACCOUNT',
                subType: 'ACCOUNT_ADDRESS_CHANGE',
                status: 'AWAITING_MEMBER_ACTION',
                priority: 'normal',
                customerType: 'MEMBER',
                wineryId: winery.id,
                memberId: memberVIP.id,
                assigneeId: manager.id,
                createdBy: manager.id,
                updatedBy: manager.id,
                suggestedChannel: 'email',
                suggestedReplySubject: 'Confirm your new address',
                suggestedReplyBody: 'Please confirm your updated delivery address via the secure link.',
                payload: {
                    newAddress: {
                        addressLine1: '12 New Vine St',
                        suburb: 'Adelaide',
                        state: 'SA',
                        postcode: '5000'
                    }
                }
            },
            // Account: payment issue rejected
            {
                type: 'ACCOUNT_PAYMENT_ISSUE',
                category: 'ACCOUNT',
                subType: 'ACCOUNT_PAYMENT_ISSUE',
                status: 'REJECTED',
                priority: 'high',
                sentiment: 'NEGATIVE',
                customerType: 'VISITOR',
                wineryId: winery.id,
                memberId: memberGuest.id,
                assigneeId: manager.id,
                createdBy: manager.id,
                updatedBy: manager.id,
                suggestedChannel: 'email',
                suggestedReplySubject: 'Unable to process payment update',
                suggestedReplyBody: 'Please contact support with your account details to resolve this.',
                payload: { issue: 'Card declined repeatedly' }
            },
            // Order: shipping delay pending review
            {
                type: 'ORDER_SHIPPING_DELAY',
                category: 'ORDER',
                subType: 'ORDER_SHIPPING_DELAY',
                status: 'PENDING_REVIEW',
                priority: 'normal',
                sentiment: 'NEGATIVE',
                customerType: 'MEMBER',
                wineryId: winery.id,
                memberId: memberNew.id,
                assigneeId: staffB.id,
                createdBy: staffB.id,
                updatedBy: staffB.id,
                suggestedChannel: 'email',
                suggestedReplySubject: 'Update on your order #1234',
                suggestedReplyBody: 'Apologies for the delay. Your order will arrive by Tuesday.',
                payload: { orderId: '1234', delayReason: 'Courier logistics' }
            },
            // Order: replacement executed
            {
                type: 'ORDER_REPLACEMENT_REQUEST',
                category: 'ORDER',
                subType: 'ORDER_REPLACEMENT_REQUEST',
                status: 'EXECUTED',
                priority: 'normal',
                sentiment: 'NEUTRAL',
                customerType: 'MEMBER',
                wineryId: winery.id,
                memberId: memberVIP.id,
                assigneeId: staffA.id,
                createdBy: staffA.id,
                updatedBy: staffA.id,
                suggestedChannel: 'email',
                suggestedReplySubject: 'Replacement order confirmed',
                suggestedReplyBody: 'We have shipped a replacement for the damaged items.',
                payload: { orderId: '1239', replacementSkus: ['SHZ-2018', 'PN-2020'] }
            },
            // Operations: maintenance request executed
            {
                type: 'OPERATIONS_MAINTENANCE_REQUEST',
                category: 'OPERATIONS',
                subType: 'OPERATIONS_MAINTENANCE_REQUEST',
                status: 'EXECUTED',
                priority: 'normal',
                customerType: 'UNKNOWN',
                wineryId: winery.id,
                assigneeId: manager.id,
                createdBy: manager.id,
                updatedBy: manager.id,
                suggestedChannel: 'none',
                payload: { note: 'Cellar door fridge needs servicing.' }
            },
            // Internal: follow-up note
            {
                type: 'INTERNAL_FOLLOW_UP',
                category: 'INTERNAL',
                subType: 'INTERNAL_FOLLOW_UP',
                status: 'PENDING_REVIEW',
                priority: 'low',
                customerType: 'UNKNOWN',
                wineryId: winery.id,
                assigneeId: manager.id,
                createdBy: manager.id,
                updatedBy: manager.id,
                suggestedChannel: 'none',
                payload: { note: 'Follow up with supplier about glassware shipment.' }
            },
            // System: alert cancelled (auto-created)
            {
                type: 'SYSTEM_ALERT',
                category: 'SYSTEM',
                subType: 'SYSTEM_ALERT',
                status: 'CANCELLED',
                priority: 'normal',
                customerType: 'UNKNOWN',
                wineryId: winery.id,
                suggestedChannel: 'none',
                payload: { alert: 'Backup job was cancelled by scheduler.' }
            },
            // General: enquiry, unassigned
            {
                type: 'GENERAL_ENQUIRY',
                category: 'GENERAL',
                subType: 'GENERAL_ENQUIRY',
                status: 'PENDING_REVIEW',
                priority: 'normal',
                sentiment: 'NEUTRAL',
                customerType: 'VISITOR',
                wineryId: winery.id,
                suggestedChannel: 'sms',
                suggestedReplyBody: 'Thanks for reaching out! We will reply shortly.',
                payload: { summary: 'Do you offer gift cards?' }
            }
        ];

        for (const taskData of tasksToCreate) {
            await Task.create(taskData);
        }

        console.log(`Created ${tasksToCreate.length} varied tasks`);
        console.log('--- Seed Complete ---');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seedTasks();
