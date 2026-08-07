process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const request = require('supertest');
const app = require('../../app');
const {
    sequelize,
    Winery,
    User,
    Task,
    TaskAction,
    TaskStep,
    Message,
    Member,
    Notice,
    NoticeAcknowledgement,
    OperationalItemRelation,
    OperationalRecord,
    OperationalRequest
} = require('../../models');

describe('Analytics Routes', () => {
    const authToken = 'Bearer mock-token';

    function todayAt(hour, minute = 0) {
        const date = new Date();
        date.setHours(hour, minute, 0, 0);
        return date;
    }

    beforeAll(async () => {
        await sequelize.sync({ force: true });

        await Winery.create({
            id: 1,
            name: 'Analytics Test Winery',
            timeZone: 'Australia/Adelaide',
            contactEmail: 'analytics@example.com'
        });

        await User.bulkCreate([
            {
                id: 7,
                firebaseUid: 'stub-uid',
                email: 'stub@example.com',
                displayName: 'Ops Manager',
                role: 'manager',
                wineryId: 1
            },
            {
                id: 8,
                firebaseUid: 'staff-uid',
                email: 'staff@example.com',
                displayName: 'Cellar Door Staff',
                role: 'staff',
                wineryId: 1
            }
        ]);

        await Member.create({
            id: 42,
            firstName: 'Casey',
            lastName: 'Customer',
            email: 'casey@example.com',
            wineryId: 1,
            source: 'email',
            lifetimeSpend: 120,
            totalOrders: 2
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('returns operational flow metrics for workflow, response, identity, handoff, and follow-up automation', async () => {
        const waitingTask = await Task.create({
            wineryId: 1,
            category: 'GENERAL',
            subType: 'GENERAL_ENQUIRY',
            customerType: 'VISITOR',
            status: 'PENDING',
            workflowState: 'WAITING',
            waitingOn: 'CUSTOMER',
            priority: 'normal',
            payload: {
                manualIntake: {
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'email',
                    identityResolutionStatus: 'REVIEW_REQUIRED'
                }
            },
            createdAt: todayAt(8),
            updatedAt: todayAt(9)
        });

        const blockedTask = await Task.create({
            wineryId: 1,
            category: 'ORDER',
            subType: 'ORDER_STATUS',
            customerType: 'MEMBER',
            memberId: 42,
            status: 'PENDING',
            workflowState: 'BLOCKED',
            waitingOn: 'STAFF',
            blockedReason: 'Missing tracking reference',
            dueAt: todayAt(7),
            priority: 'high',
            createdAt: todayAt(6),
            updatedAt: todayAt(7)
        });

        const closedTask = await Task.create({
            wineryId: 1,
            category: 'ACCOUNT',
            subType: 'ACCOUNT_ADDRESS_CHANGE',
            customerType: 'MEMBER',
            memberId: 42,
            status: 'ACTIONED',
            workflowState: 'COMPLETED',
            waitingOn: 'NONE',
            resolvedAs: 'COMPLETED',
            resolutionType: 'REPLIED',
            customerOutcome: 'INFO_PROVIDED',
            resolvedAt: todayAt(13),
            priority: 'normal',
            createdAt: todayAt(10),
            updatedAt: todayAt(13)
        });

        const responseTask = await Task.create({
            wineryId: 1,
            category: 'GENERAL',
            subType: 'GENERAL_ENQUIRY',
            customerType: 'VISITOR',
            status: 'PENDING',
            workflowState: 'IN_PROGRESS',
            waitingOn: 'STAFF',
            assigneeId: 8,
            priority: 'normal',
            createdAt: todayAt(11),
            updatedAt: todayAt(12)
        });

        await Message.bulkCreate([
            {
                wineryId: 1,
                memberId: 42,
                taskId: responseTask.id,
                source: 'email',
                direction: 'inbound',
                subject: 'Question',
                body: 'Can you help?',
                receivedAt: todayAt(11),
                createdAt: todayAt(11)
            },
            {
                wineryId: 1,
                memberId: 42,
                taskId: responseTask.id,
                source: 'email',
                direction: 'outbound',
                subject: 'Re: Question',
                body: 'Yes, we can help.',
                receivedAt: todayAt(11, 30),
                createdAt: todayAt(11, 30)
            }
        ]);

        await TaskAction.create({
            taskId: responseTask.id,
            userId: 7,
            actionType: 'ASSIGNED',
            details: { from: null, to: 8 },
            createdAt: todayAt(12)
        });

        await TaskStep.create({
            taskId: waitingTask.id,
            title: 'Wait for customer confirmation',
            stepType: 'CUSTOMER_WAIT',
            status: 'PENDING',
            waitingOn: 'CUSTOMER',
            createdAt: todayAt(8, 15),
            updatedAt: todayAt(8, 15)
        });

        await TaskStep.create({
            taskId: blockedTask.id,
            title: 'Find tracking reference',
            stepType: 'INTERNAL',
            status: 'BLOCKED',
            waitingOn: 'STAFF',
            createdAt: todayAt(6, 30),
            updatedAt: todayAt(6, 30)
        });

        await Task.create({
            wineryId: 1,
            parentTaskId: closedTask.id,
            category: 'GENERAL',
            subType: 'GENERAL_FOLLOW_UP',
            customerType: 'MEMBER',
            memberId: 42,
            status: 'PENDING',
            workflowState: 'NOT_STARTED',
            waitingOn: 'NONE',
            payload: {
                followUpAutomation: {
                    isAutoGenerated: true,
                    sourceTaskId: closedTask.id,
                    automationType: 'CUSTOMER_NO_RESPONSE_CALLBACK'
                }
            },
            createdAt: todayAt(14),
            updatedAt: todayAt(14)
        });

        const requiredNotice = await Notice.create({
            wineryId: 1,
            title: 'Acknowledge service policy',
            body: 'Read before the next shift.',
            category: 'STAFF',
            priority: 'important',
            requiresAcknowledgement: true,
            acknowledgementDueAt: new Date(Date.now() - 60 * 60 * 1000),
            createdBy: 7,
            createdAt: todayAt(9)
        });
        await NoticeAcknowledgement.create({
            noticeId: requiredNotice.id,
            wineryId: 1,
            userId: 7,
            acknowledgedAt: todayAt(10),
            createdAt: todayAt(10)
        });

        const oldDate = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
        await OperationalRequest.create({
            wineryId: 1,
            title: 'Cellar door POS froze at lunch',
            body: 'The cellar door POS froze during lunch service.',
            originalText: 'Cellar door POS froze during lunch service.',
            subtype: 'POS_RELIABILITY',
            status: 'PENDING',
            priority: 'high',
            sourceType: 'AI',
            aiSuggestedType: 'REQUEST',
            humanConfirmedType: 'REQUEST',
            confirmedBy: 7,
            confirmedAt: todayAt(9),
            createdBy: 7,
            updatedBy: 7,
            createdAt: todayAt(9)
        });
        await OperationalRequest.create({
            wineryId: 1,
            title: 'Long-running supplier approval',
            body: 'Awaiting approval beyond the requested date.',
            originalText: 'Awaiting supplier approval.',
            subtype: 'SUPPLIER_APPROVAL',
            status: 'PENDING',
            priority: 'high',
            sourceType: 'MANUAL',
            humanConfirmedType: 'REQUEST',
            confirmedBy: 7,
            confirmedAt: oldDate,
            createdBy: 7,
            updatedBy: 7,
            createdAt: oldDate,
            dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
        });
        const recurringRecord = await OperationalRecord.create({
            wineryId: 1,
            title: 'Cellar door POS froze again',
            body: 'The cellar door POS froze again during dinner service.',
            originalText: 'Cellar door POS froze again during dinner service.',
            recordType: 'POS_RELIABILITY',
            sourceType: 'AI',
            aiSuggestedType: 'REQUEST',
            humanConfirmedType: 'NOTE',
            confirmedBy: 7,
            confirmedAt: todayAt(11),
            occurredAt: todayAt(11),
            createdBy: 7,
            updatedBy: 7,
            createdAt: todayAt(11)
        });
        await OperationalItemRelation.create({
            wineryId: 1,
            sourceType: 'NOTE',
            sourceId: recurringRecord.id,
            targetType: 'TASK',
            targetId: responseTask.id,
            relationType: 'GENERATED_TASK',
            createdBy: 7,
            createdAt: todayAt(12)
        });

        const res = await request(app)
            .get('/api/analytics?period=day&offset=0')
            .set('Authorization', authToken)
            .expect(200);

        expect(res.body.operations.workflow.currentWaiting).toBeGreaterThanOrEqual(1);
        expect(res.body.operations.workflow.currentBlocked).toBeGreaterThanOrEqual(1);
        expect(res.body.operations.workflow.overdueTasks).toBeGreaterThanOrEqual(1);
        expect(res.body.operations.timing.avgResolutionHours).toBeGreaterThan(0);
        expect(res.body.operations.response.respondedThreads).toBe(1);
        expect(res.body.operations.response.avgFirstResponseMinutes).toBe(30);
        expect(res.body.operations.handoffs.total).toBe(1);
        expect(res.body.operations.identity.reviewRequired).toBeGreaterThanOrEqual(1);
        expect(res.body.operations.followUps.generated).toBe(1);
        expect(res.body.operations.followUps.byAutomationType[0].automationType).toBe('CUSTOMER_NO_RESPONSE_CALLBACK');
        expect(res.body.operations.acknowledgements).toMatchObject({
            requiredNotices: 1,
            overdueNotices: 1,
            expectedAcknowledgements: 2,
            completedAcknowledgements: 1,
            outstandingAcknowledgements: 1,
            completionRate: 50
        });
        expect(res.body.operations.intelligence.requestAging.pending).toBeGreaterThanOrEqual(1);
        expect(res.body.operations.intelligence.requestAging.overdue).toBeGreaterThanOrEqual(1);
        expect(res.body.operations.intelligence.classification).toMatchObject({ evaluated: 2, corrected: 1, correctionRate: 50 });
        expect(res.body.operations.intelligence.conversions).toMatchObject({ total: 1, pending: 1 });
        expect(res.body.operations.intelligence.recurrence.advisory).toBe(true);
        expect(res.body.operations.intelligence.recurrence.clusters[0].keywords).toEqual(expect.arrayContaining(['pos', 'froze']));
        expect(res.body.operations.intelligence.trends.byType).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'REQUEST', current: expect.any(Number), previous: expect.any(Number), delta: expect.any(Number) })
        ]));
        expect(res.body.operations.intelligence.trends.byArea).toEqual(expect.any(Array));
        expect(res.body.operations.intelligence.suggestedSignals).toEqual(expect.arrayContaining([
            expect.objectContaining({ signalType: 'REQUEST_AGING', fingerprint: expect.any(String) })
        ]));
    });
});
