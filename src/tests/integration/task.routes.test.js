process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
const request = require('supertest');
const app = require('../../app');
const { sequelize, Winery, Task, TaskStep, User, Message, Member, Notification, TaskAction } = require('../../models');

describe('Task Routes', () => {
    let winery;
    const authToken = 'Bearer mock-token';

    beforeAll(async () => {
        // Create Winery
        try {
            await sequelize.sync({ force: true });
            // Try to find or create ID 1 to match the stub auth middleware
            const [w] = await Winery.findOrCreate({
                where: { id: 1 },
                defaults: {
                    name: 'Task Test Winery',
                    timeZone: 'Australia/Adelaide',
                    contactEmail: 'tasks@example.com'
                }
            });
            winery = w;

            // Also create User and Default Settings
            await User.findOrCreate({
                where: { id: 7 },
                defaults: {
                    firebaseUid: 'stub-uid-7',
                    email: 'stub@example.com',
                    displayName: 'Stub User',
                    role: 'manager',
                    wineryId: w.id
                }
            });

            // Ensure settings exist for feature flags
            const { WinerySettings } = require('../../models');
            await WinerySettings.findOrCreate({
                where: { wineryId: w.id },
                defaults: {
                    tier: 'ADVANCED',
                    enableWineClubModule: true,
                    enableSecureLinks: true,
                    enableOrdersModule: true,
                    enableBookingModule: true
                }
            });

        } catch (e) {
            console.log('Error setting up winery:', e);
        }
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe('GET /api/tasks', () => {
        it('should list tasks for the authenticated winery', async () => {
            // Seed a task for Winery 1
            await Task.create({
                type: 'GENERAL_QUERY',
                status: 'PENDING',
                wineryId: 1,
                priority: 'normal'
            });

            const res = await request(app)
                .get('/api/tasks')
                .set('Authorization', authToken)
                .expect(200);

            expect(Array.isArray(res.body.tasks)).toBe(true);
            expect(res.body.tasks.length).toBeGreaterThan(0);
            expect(res.body.tasks[0].wineryId).toBe(1);
        });

        it('returns stable pagination metadata and distinct task pages', async () => {
            const firstCreatedAt = new Date('2026-07-01T08:00:00.000Z');
            const secondCreatedAt = new Date('2026-07-01T08:01:00.000Z');
            const firstTask = await Task.create({
                type: 'GENERAL_QUERY',
                status: 'PENDING',
                wineryId: 1,
                category: 'INTERNAL',
                subType: 'TASK_PAGINATION_MATCH',
                priority: 'normal',
                createdAt: firstCreatedAt,
                updatedAt: firstCreatedAt
            });
            const secondTask = await Task.create({
                type: 'GENERAL_QUERY',
                status: 'PENDING',
                wineryId: 1,
                category: 'INTERNAL',
                subType: 'TASK_PAGINATION_MATCH',
                priority: 'normal',
                createdAt: secondCreatedAt,
                updatedAt: secondCreatedAt
            });

            const firstPage = await request(app)
                .get('/api/tasks?status=all&search=TASK_PAGINATION_MATCH&sortBy=feed_oldest&page=1&pageSize=1')
                .set('Authorization', authToken)
                .expect(200);
            const secondPage = await request(app)
                .get('/api/tasks?status=all&search=TASK_PAGINATION_MATCH&sortBy=feed_oldest&page=2&pageSize=1')
                .set('Authorization', authToken)
                .expect(200);

            expect(firstPage.body.pagination).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
            expect(secondPage.body.pagination).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
            expect(firstPage.body.tasks.map((task) => task.id)).toEqual([firstTask.id]);
            expect(secondPage.body.tasks.map((task) => task.id)).toEqual([secondTask.id]);
        });

        it('returns exact queue-wide summary metrics for the current filters', async () => {
            await Task.create({
                type: 'GENERAL_QUERY',
                status: 'PENDING',
                wineryId: 1,
                category: 'INTERNAL',
                subType: 'QUEUE_SUMMARY_MATCH',
                priority: 'high',
                workflowState: 'BLOCKED',
                dueAt: new Date(Date.now() - 60 * 60 * 1000),
                followUpRequired: true,
                payload: { manualIntake: { identityResolutionStatus: 'REVIEW_REQUIRED' } }
            });
            await Task.create({
                type: 'GENERAL_QUERY',
                status: 'PENDING',
                wineryId: 1,
                category: 'INTERNAL',
                subType: 'QUEUE_SUMMARY_MATCH',
                priority: 'normal',
                workflowState: 'WAITING',
                assigneeId: 7,
                dueAt: new Date(Date.now() + 60 * 60 * 1000)
            });

            const res = await request(app)
                .get('/api/tasks/summary?status=all&search=QUEUE_SUMMARY_MATCH')
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.summary).toMatchObject({
                matching: 2,
                highPriority: 1,
                waiting: 1,
                blocked: 1,
                unassigned: 1,
                overdue: 1,
                dueSoon: 1,
                identityReview: 1,
                followUps: 1
            });
        });

        it('should 401 without token', async () => {
            await request(app)
                .get('/api/tasks')
                .expect(401);
        });

        it('should filter open tasks by overdue deadline state', async () => {
            const overdueTask = await Task.create({
                type: 'GENERAL_QUERY',
                status: 'PENDING',
                wineryId: 1,
                category: 'INTERNAL',
                subType: 'OVERDUE_FILTER_MATCH',
                priority: 'normal',
                dueAt: new Date(Date.now() - 60 * 60 * 1000)
            });

            await Task.create({
                type: 'GENERAL_QUERY',
                status: 'PENDING',
                wineryId: 1,
                category: 'INTERNAL',
                subType: 'OVERDUE_FILTER_MATCH_FUTURE',
                priority: 'normal',
                dueAt: new Date(Date.now() + 60 * 60 * 1000)
            });

            const res = await request(app)
                .get('/api/tasks?status=all&deadlineState=OVERDUE&search=OVERDUE_FILTER_MATCH')
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.tasks.map((task) => task.id)).toContain(overdueTask.id);
            expect(res.body.tasks.every((task) => task.deadlineState === 'OVERDUE')).toBe(true);
        });
    });

    describe('POST /api/tasks/autoclassify', () => {
        it('should autoclassify a staff note', async () => {
            const res = await request(app)
                .post('/api/tasks/autoclassify')
                .send({ text: 'The printer is out of ink' })
                .set('Authorization', authToken) // Stub auth
                .expect(200);

            // AI classification may vary, just check we get valid fields
            expect(res.body.category).toBeDefined();
            expect(['OPERATIONS', 'INTERNAL', 'GENERAL']).toContain(res.body.category);
            expect(res.body.subType).toBeDefined();
        });

        it('should accept seeded demo customer email domains during autoclassification', async () => {
            const res = await request(app)
                .post('/api/tasks/autoclassify')
                .send({
                    text: 'Hills Luxury Day Tours asked about a private group tasting.',
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'phone',
                    requesterName: 'Hills Luxury Day Tours',
                    requesterEmail: 'hello@hillsluxurydaytours.example.test',
                    requesterPhone: '0421 640 772',
                    suggestedChannel: 'voice'
                })
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.category).toBeDefined();
        });
    });

    describe('POST /api/tasks (Manual Creation)', () => {
        it('should create a task with new fields (sentiment, attribution)', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'INTERNAL',
                    inboundMethod: 'internal',
                    category: 'OPERATIONS',
                    subType: 'OPERATIONS_ESCALATION',
                    sentiment: 'NEGATIVE',
                    notes: 'Customer is very upset',
                    priority: 'high'
                })
                .set('Authorization', authToken)
                .expect(201);

            const task = res.body.task;
            expect(task.category).toBe('OPERATIONS');
            expect(task.subType).toBe('OPERATIONS_ESCALATION');
            expect(task.sentiment).toBe('NEGATIVE');
            expect(task.createdBy).toBe(7); // Stub user ID
        });

        it('should create a task with structured workflow steps', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'phone',
                    requesterName: 'Chris Member',
                    requesterPhone: '+61400000099',
                    category: 'GENERAL',
                    subType: 'GENERAL_ENQUIRY',
                    priority: 'normal',
                    steps: [
                        {
                            title: 'Review the enquiry',
                            stepType: 'INTERNAL',
                            waitingOn: 'STAFF'
                        },
                        {
                            title: 'Send the reply',
                            stepType: 'CUSTOMER_MESSAGE',
                            waitingOn: 'STAFF'
                        }
                    ]
                })
                .set('Authorization', authToken)
                .expect(201);

            expect(res.body.task.workflowState).toBe('NOT_STARTED');
            expect(res.body.task.nextStepSummary).toBe('Review the enquiry');

            const createdSteps = await TaskStep.findAll({
                where: { taskId: res.body.task.id },
                order: [['sortOrder', 'ASC']]
            });
            expect(createdSteps).toHaveLength(2);
            expect(createdSteps[0].title).toBe('Review the enquiry');
        });

        it('should route unassigned staff-created tasks to a manager first', async () => {
            const manager = await User.findOrCreate({
                where: { id: 8 },
                defaults: {
                    firebaseUid: 'manager-uid-8',
                    email: 'manager-review@example.com',
                    displayName: 'Review Manager',
                    role: 'manager',
                    wineryId: winery.id
                }
            }).then(([user]) => user);

            await User.update({ role: 'staff' }, { where: { id: 7 } });

            try {
                const res = await request(app)
                    .post('/api/tasks')
                    .send({
                        taskOrigin: 'INTERNAL',
                        inboundMethod: 'internal',
                        category: 'INTERNAL',
                        subType: 'INTERNAL_REMINDER',
                        priority: 'normal',
                        notes: 'Please decide who should handle the stocktake.'
                    })
                    .set('Authorization', authToken)
                    .expect(201);

                expect(res.body.task.assigneeId).toBeNull();

                const createdSteps = await TaskStep.findAll({
                    where: { taskId: res.body.task.id },
                    order: [['sortOrder', 'ASC']]
                });

                expect(createdSteps[0].title).toBe('Assign to staff');
                expect(createdSteps[0].waitingOn).toBe('MANAGER');
                expect(createdSteps[0].ownerUserId).toBe(manager.id);
                expect(createdSteps[0].metadata.reason).toBe('STAFF_CREATED_UNASSIGNED');
                expect(createdSteps[0].metadata.assignmentTargetRole).toBe('staff');

                const managerNotification = await Notification.findOne({
                    where: {
                        userId: manager.id,
                        type: 'SYSTEM'
                    },
                    order: [['id', 'DESC']]
                });
                expect(managerNotification).toBeDefined();
                expect(managerNotification.message).toMatch(/needs manager assignment to staff/i);
                expect(managerNotification.data.taskId).toBe(res.body.task.id);
                expect(managerNotification.data.stepId).toBe(createdSteps[0].id);
            } finally {
                await User.update({ role: 'manager' }, { where: { id: 7 } });
            }
        });

        it('should prevent staff from assigning a new task to someone else', async () => {
            const otherStaff = await User.findOrCreate({
                where: { id: 9 },
                defaults: {
                    firebaseUid: 'staff-uid-9',
                    email: 'other-staff@example.com',
                    displayName: 'Other Staff',
                    role: 'staff',
                    wineryId: winery.id
                }
            }).then(([user]) => user);

            await User.update({ role: 'staff' }, { where: { id: 7 } });

            try {
                await request(app)
                    .post('/api/tasks')
                    .send({
                        taskOrigin: 'INTERNAL',
                        inboundMethod: 'internal',
                        category: 'INTERNAL',
                        subType: 'INTERNAL_REMINDER',
                        priority: 'normal',
                        assigneeId: otherStaff.id,
                        notes: 'Try to assign this to someone else.'
                    })
                    .set('Authorization', authToken)
                    .expect(403);
            } finally {
                await User.update({ role: 'manager' }, { where: { id: 7 } });
            }
        });

        it('should persist structured manual intake metadata for external tasks', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'email',
                    requesterName: 'Taylor Prospect',
                    requesterEmail: 'taylor@example.com',
                    category: 'GENERAL',
                    subType: 'GENERAL_ENQUIRY',
                    priority: 'normal',
                    notes: 'Prospect asked about their next shipment timing'
                })
                .set('Authorization', authToken)
                .expect(201);

            expect(res.body.task.customerType).toBe('VISITOR');
            expect(res.body.task.suggestedChannel).toBe('email');
            expect(res.body.task.payload.manualIntake).toMatchObject({
                taskOrigin: 'EXTERNAL',
                inboundMethod: 'email',
                requesterName: 'Taylor Prospect',
                requesterEmail: 'taylor@example.com'
            });
        });

        it('should persist original AI suggestion review data for manual overrides', async () => {
            const suggestionReview = {
                version: 1,
                source: 'manual_task_creation_preview',
                capturedAt: new Date().toISOString(),
                originalSuggestion: {
                    title: 'Original title',
                    suggestedRecipientEmail: 'wrong@example.com'
                },
                finalSelection: {
                    title: 'Corrected title',
                    suggestedRecipientEmail: 'right@example.com'
                },
                changedFields: {
                    title: {
                        suggested: 'Original title',
                        final: 'Corrected title'
                    },
                    suggestedRecipientEmail: {
                        suggested: 'wrong@example.com',
                        final: 'right@example.com'
                    }
                }
            };

            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'email',
                    requesterName: 'Override Customer',
                    requesterEmail: 'right@example.com',
                    category: 'GENERAL',
                    subType: 'GENERAL_ENQUIRY',
                    priority: 'normal',
                    payload: {
                        summary: 'Corrected title',
                        originalText: 'Customer asked a question',
                        aiSuggestionReview: suggestionReview
                    },
                    suggestedRecipientEmail: 'right@example.com',
                    suggestedCc: 'manager@example.com',
                    suggestedAction: 'Use the corrected recipient.'
                })
                .set('Authorization', authToken)
                .expect(201);

            expect(res.body.task.payload.aiSuggestionReview.changedFields.suggestedRecipientEmail.final).toBe('right@example.com');
            expect(res.body.task.payload.summary).toBe('Corrected title');

            const creationAction = await TaskAction.findOne({
                where: { taskId: res.body.task.id, actionType: 'MANUAL_CREATED' }
            });
            expect(creationAction.details.suggestionReview.changedFields.title.final).toBe('Corrected title');
        });

        it('should link a referenced message into the task communication timeline', async () => {
            const message = await Message.create({
                source: 'email',
                direction: 'inbound',
                subject: 'Need help with my order',
                body: 'Can you check where order 123 is?',
                wineryId: 1,
                receivedAt: new Date()
            });

            const createRes = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'email',
                    requesterName: 'Casey Prospect',
                    requesterEmail: 'casey@example.com',
                    category: 'GENERAL',
                    subType: 'GENERAL_ENQUIRY',
                    messageId: message.id
                })
                .set('Authorization', authToken)
                .expect(201);

            const linkedMessage = await Message.findByPk(message.id);
            expect(linkedMessage.taskId).toBe(createRes.body.task.id);

            const taskRes = await request(app)
                .get(`/api/tasks/${createRes.body.task.id}`)
                .set('Authorization', authToken)
                .expect(200);

            expect(taskRes.body.task.Messages).toHaveLength(1);
            expect(taskRes.body.task.Messages[0].id).toBe(message.id);
            expect(taskRes.body.task.Messages[0].direction).toBe('inbound');
        });

        it('should reject external tasks with no linked member or contact details', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'phone',
                    category: 'GENERAL',
                    subType: 'GENERAL_ENQUIRY',
                    priority: 'normal',
                    notes: 'Customer asked for a callback'
                })
                .set('Authorization', authToken)
                .expect(400);

            expect(res.body.error.message).toMatch(/linked member|contact detail/i);
        });

        it('should ignore invalid email fields when the preferred response is phone', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'phone',
                    requesterName: 'Phone Caller',
                    requesterEmail: 'not an email',
                    requesterPhone: '0400 555 111',
                    category: 'GENERAL',
                    subType: 'GENERAL_ENQUIRY',
                    priority: 'normal',
                    notes: 'Customer called and asked for a return call',
                    suggestedChannel: 'voice',
                    suggestedRecipientEmail: 'also not an email',
                    suggestedReplySubject: 'Callback request',
                    suggestedCc: 'manager@example.com'
                })
                .set('Authorization', authToken)
                .expect(201);

            expect(res.body.task.suggestedChannel).toBe('voice');
            expect(res.body.task.suggestedRecipientEmail).toBeNull();
            expect(res.body.task.suggestedReplySubject).toBeNull();
            expect(res.body.task.suggestedCc).toBeNull();
            expect(res.body.task.payload.manualIntake.requesterEmail).toBeNull();
            expect(res.body.task.payload.manualIntake.requesterPhone).toBe('0400 555 111');
        });

        it('should auto-create and link a member for external booking/order/account tasks when contact data is present', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'email',
                    requesterName: 'Jordan Prospect',
                    requesterEmail: 'jordan@example.com',
                    category: 'BOOKING',
                    subType: 'BOOKING_NEW',
                    priority: 'normal',
                    notes: 'Prospect asked to book a tasting next weekend'
                })
                .set('Authorization', authToken)
                .expect(201);

            expect(res.body.task.memberId).toBeDefined();
            expect(res.body.task.payload.manualIntake.memberAutoLinked).toBe(true);

            const { Member } = require('../../models');
            const member = await Member.findByPk(res.body.task.memberId);
            expect(member).toBeDefined();
            expect(member.email).toBe('jordan@example.com');
            expect(member.firstName).toBe('Jordan');
            expect(member.lastName).toBe('Prospect');
            expect(member.source).toBe('email');
        });

        it('should reuse an existing member when external intake matches their email', async () => {
            const { Member } = require('../../models');
            const existingMember = await Member.create({
                firstName: 'Existing',
                lastName: 'Customer',
                email: 'existing@example.com',
                wineryId: winery.id
            });

            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'email',
                    requesterName: 'Existing Customer',
                    requesterEmail: 'existing@example.com',
                    category: 'ORDER',
                    subType: 'ORDER_STATUS',
                    priority: 'normal',
                    notes: 'Customer emailed asking for order status'
                })
                .set('Authorization', authToken)
                .expect(201);

            expect(res.body.task.memberId).toBe(existingMember.id);
            expect(res.body.task.payload.manualIntake.memberAutoLinked).toBe(true);
            expect(res.body.task.payload.manualIntake.memberMatchReason).toMatch(/matched:email_exact/);
        });

        it('should reuse an existing member when phone formatting differs but name and phone suffix match', async () => {
            const { Member } = require('../../models');
            const existingMember = await Member.create({
                firstName: 'Morgan',
                lastName: 'Lee',
                phone: '+61 400 123 456',
                wineryId: winery.id
            });

            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'phone',
                    requesterName: 'Morgan Lee',
                    requesterPhone: '0400 123 456',
                    category: 'ACCOUNT',
                    subType: 'ACCOUNT_LOGIN_ISSUE',
                    priority: 'normal',
                    notes: 'Customer called about being locked out'
                })
                .set('Authorization', authToken)
                .expect(201);

            expect(res.body.task.memberId).toBe(existingMember.id);
            expect(res.body.task.payload.manualIntake.memberAutoLinked).toBe(true);
            expect(res.body.task.payload.manualIntake.memberMatchReason).toMatch(/phone_suffix/);
        });

        it('should require review instead of auto-linking when the candidate match is too weak', async () => {
            const { Member } = require('../../models');
            const existingMember = await Member.create({
                firstName: 'Morgan',
                lastName: 'Lee',
                phone: '+61 411 222 333',
                wineryId: winery.id
            });

            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'phone',
                    requesterName: 'Morgan Other',
                    requesterPhone: '0411 222 333',
                    category: 'ORDER',
                    subType: 'ORDER_STATUS',
                    priority: 'normal',
                    notes: 'Caller wants an update on a recent order'
                })
                .set('Authorization', authToken)
                .expect(201);

            expect(res.body.task.memberId).toBeNull();
            expect(res.body.task.payload.manualIntake.identityResolutionStatus).toBe('REVIEW_REQUIRED');
            expect(res.body.task.payload.manualIntake.suggestedMemberId).toBe(existingMember.id);
            expect(res.body.task.payload.manualIntake.suggestedCandidates).toHaveLength(1);
            expect(res.body.task.payload.manualIntake.memberAutoLinked).toBe(false);
        });

        it('should respect winery matching settings when deciding whether to auto-link or only suggest review candidates', async () => {
            const { Member, WinerySettings } = require('../../models');
            await WinerySettings.update({
                identityMatchingConfig: {
                    autoLinkThreshold: 250,
                    reviewThreshold: 90,
                    maxReviewCandidates: 3,
                    allowPhoneSuffixNameAutoLink: false,
                    allowNameOnlyReview: true
                }
            }, { where: { wineryId: winery.id } });

            const existingMember = await Member.create({
                firstName: 'Casey',
                lastName: 'Stone',
                phone: '+61 422 333 444',
                wineryId: winery.id
            });

            const res = await request(app)
                .post('/api/tasks')
                .send({
                    taskOrigin: 'EXTERNAL',
                    inboundMethod: 'phone',
                    requesterName: 'Casey Stone',
                    requesterPhone: '0422 333 444',
                    category: 'ACCOUNT',
                    subType: 'ACCOUNT_LOGIN_ISSUE',
                    priority: 'normal',
                    notes: 'Caller needs help accessing their account'
                })
                .set('Authorization', authToken)
                .expect(201);

            expect(res.body.task.memberId).toBeNull();
            expect(res.body.task.payload.manualIntake.identityResolutionStatus).toBe('REVIEW_REQUIRED');
            expect(res.body.task.payload.manualIntake.suggestedCandidates[0].memberId).toBe(existingMember.id);

            await WinerySettings.update({
                identityMatchingConfig: null
            }, { where: { wineryId: winery.id } });
        });
    });

    describe('PATCH /api/tasks/:id', () => {
        let task;
        beforeEach(async () => {
            task = await Task.create({
                wineryId: winery.id,
                status: 'PENDING',
                category: 'GENERAL'
            });
        });

        it('should update task assignment and log action', async () => {
            const res = await request(app)
                .patch(`/api/tasks/${task.id}`)
                .send({ assigneeId: 7 }) // Assign to self
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.task.assigneeId).toBe(7);

            // Verify Logic: Action Log
            const { TaskAction } = require('../../models');
            const action = await TaskAction.findOne({
                where: { taskId: task.id, actionType: 'ASSIGNED' }
            });
            expect(action).toBeDefined();
            expect(action.userId).toBe(7);
        });

        it('should update editable suggested communication fields', async () => {
            const res = await request(app)
                .patch(`/api/tasks/${task.id}`)
                .send({
                    suggestedAction: 'Send the corrected reply to the new address.',
                    suggestedRecipientEmail: 'corrected@example.com',
                    suggestedCc: 'manager@example.com,owner@example.com',
                    suggestedReplySubject: 'Corrected subject',
                    suggestedReplyBody: 'Corrected reply body',
                    suggestedChannel: 'email'
                })
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.task.suggestedAction).toBe('Send the corrected reply to the new address.');
            expect(res.body.task.suggestedRecipientEmail).toBe('corrected@example.com');
            expect(res.body.task.suggestedCc).toBe('manager@example.com,owner@example.com');

            const action = await TaskAction.findOne({
                where: { taskId: task.id, actionType: 'MANUAL_UPDATE' }
            });
            expect(action.details.changes.suggestedRecipientEmail).toBe('corrected@example.com');
            expect(action.details.changes.suggestedCc).toBe('manager@example.com,owner@example.com');
        });

        it('should notify only the current assignee when assignment changes', async () => {
            const assigneeA = await User.findOrCreate({
                where: { id: 10 },
                defaults: {
                    firebaseUid: 'staff-uid-10',
                    email: 'assignee-a@example.com',
                    displayName: 'Assignee A',
                    role: 'staff',
                    wineryId: winery.id
                }
            }).then(([user]) => user);
            const assigneeB = await User.findOrCreate({
                where: { id: 11 },
                defaults: {
                    firebaseUid: 'staff-uid-11',
                    email: 'assignee-b@example.com',
                    displayName: 'Assignee B',
                    role: 'staff',
                    wineryId: winery.id
                }
            }).then(([user]) => user);

            await request(app)
                .patch(`/api/tasks/${task.id}`)
                .send({ assigneeId: assigneeA.id })
                .set('Authorization', authToken)
                .expect(200);

            const firstNotifications = await Notification.findAll({
                where: { userId: assigneeA.id, type: 'ASSIGNMENT', isRead: false }
            });
            expect(firstNotifications.some(notification => Number(notification.data?.taskId) === task.id)).toBe(true);

            await request(app)
                .patch(`/api/tasks/${task.id}`)
                .send({ assigneeId: assigneeB.id })
                .set('Authorization', authToken)
                .expect(200);

            const staleNotifications = await Notification.findAll({
                where: { userId: assigneeA.id, type: 'ASSIGNMENT', isRead: false }
            });
            expect(staleNotifications.some(notification => Number(notification.data?.taskId) === task.id)).toBe(false);

            const currentNotifications = await Notification.findAll({
                where: { userId: assigneeB.id, type: 'ASSIGNMENT', isRead: false }
            });
            expect(currentNotifications.some(notification => Number(notification.data?.taskId) === task.id)).toBe(true);
        });

        it('should restrict manager assignment review tasks to internal staff users', async () => {
            const managerTarget = await User.findOrCreate({
                where: { id: 30 },
                defaults: {
                    firebaseUid: 'manager-target-uid-30',
                    email: 'manager-target@example.com',
                    displayName: 'Manager Target',
                    role: 'manager',
                    wineryId: winery.id
                }
            }).then(([user]) => user);
            const staffTarget = await User.findOrCreate({
                where: { id: 31 },
                defaults: {
                    firebaseUid: 'staff-target-uid-31',
                    email: 'staff-target@example.com',
                    displayName: 'Staff Target',
                    role: 'staff',
                    wineryId: winery.id
                }
            }).then(([user]) => user);

            await managerTarget.update({ role: 'manager', wineryId: winery.id });
            await staffTarget.update({ role: 'staff', wineryId: winery.id });
            await User.update({ role: 'staff' }, { where: { id: 7 } });

            try {
                const createRes = await request(app)
                    .post('/api/tasks')
                    .send({
                        taskOrigin: 'INTERNAL',
                        inboundMethod: 'internal',
                        category: 'INTERNAL',
                        subType: 'INTERNAL_REMINDER',
                        priority: 'normal',
                        notes: 'Manager should send this to staff only.',
                        steps: [
                            {
                                title: 'Complete the internal follow-up',
                                stepType: 'INTERNAL',
                                waitingOn: 'STAFF'
                            }
                        ]
                    })
                    .set('Authorization', authToken)
                    .expect(201);

                await User.update({ role: 'manager' }, { where: { id: 7 } });

                await request(app)
                    .patch(`/api/tasks/${createRes.body.task.id}`)
                    .send({ assigneeId: managerTarget.id })
                    .set('Authorization', authToken)
                    .expect(400);

                const assignRes = await request(app)
                    .patch(`/api/tasks/${createRes.body.task.id}`)
                    .send({ assigneeId: staffTarget.id })
                    .set('Authorization', authToken)
                    .expect(200);

                expect(assignRes.body.task.assigneeId).toBe(staffTarget.id);

                const steps = await TaskStep.findAll({
                    where: { taskId: createRes.body.task.id },
                    order: [['sortOrder', 'ASC']]
                });
                expect(steps[0].title).toBe('Assign to staff');
                expect(steps[0].status).toBe('COMPLETED');
                expect(steps[0].waitingOn).toBe('NONE');
                expect(steps[1].ownerUserId).toBe(staffTarget.id);
                expect(assignRes.body.task.nextStepSummary).toBe('Complete the internal follow-up');
            } finally {
                await User.update({ role: 'manager' }, { where: { id: 7 } });
            }
        });

        it('should action an ORDER task and record structured execution results', async () => {
            const { Member } = require('../../models');
            const member = await Member.create({
                firstName: 'Order',
                lastName: 'Route',
                wineryId: winery.id,
                email: 'route-order@example.com'
            });

            const orderTask = await Task.create({
                wineryId: winery.id,
                status: 'PENDING',
                category: 'ORDER',
                type: 'ORDER_SHIPPING_DELAY',
                subType: 'ORDER_SHIPPING_DELAY',
                memberId: member.id,
                payload: { orderId: 'TEST-123' }
            });

            const res = await request(app)
                .patch(`/api/tasks/${orderTask.id}`)
                .send({
                    status: 'ACTIONED'
                })
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.task.status).toBe('ACTIONED');

            const { TaskAction } = require('../../models');
            const actions = await TaskAction.findAll({ where: { taskId: orderTask.id } });
            const writebackAction = actions.find(
                (action) => action.actionType === 'ACTIONED' && action.details?.action === 'ORDER_WRITEBACK'
            );
            const executionAudit = actions.find(
                (action) => action.actionType === 'EXECUTION_RECORDED' && action.details?.operation === 'crm_writeback'
            );

            expect(writebackAction).toBeDefined();
            expect(executionAudit).toBeDefined();
            expect(executionAudit.details.status).toBe('RECORDED');
        });

        it('should record default structured outcomes when a task is actioned', async () => {
            const outcomeTask = await Task.create({
                wineryId: winery.id,
                status: 'PENDING',
                category: 'GENERAL',
                subType: 'GENERAL_ENQUIRY'
            });

            const res = await request(app)
                .patch(`/api/tasks/${outcomeTask.id}`)
                .send({ status: 'ACTIONED' })
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.task.resolvedAs).toBe('COMPLETED');
            expect(res.body.task.resolutionType).toBe('REPLIED');
            expect(res.body.task.customerOutcome).toBe('INFO_PROVIDED');
            expect(res.body.task.followUpRequired).toBe(false);
            expect(res.body.task.resolvedAt).toBeTruthy();

            const { TaskAction } = require('../../models');
            const outcomeAction = await TaskAction.findOne({
                where: { taskId: outcomeTask.id, actionType: 'OUTCOME_RECORDED' }
            });
            expect(outcomeAction).toBeDefined();
        });

        it('should remove task notifications when a task is actioned', async () => {
            const notifiedTask = await Task.create({
                wineryId: winery.id,
                status: 'PENDING',
                category: 'GENERAL',
                subType: 'GENERAL_ENQUIRY'
            });
            const keepTask = await Task.create({
                wineryId: winery.id,
                status: 'PENDING',
                category: 'GENERAL',
                subType: 'GENERAL_ENQUIRY'
            });

            const removedNotification = await Notification.create({
                userId: 7,
                type: 'ASSIGNMENT',
                message: 'Task notification to remove',
                data: { taskId: notifiedTask.id }
            });
            const keptNotification = await Notification.create({
                userId: 7,
                type: 'ASSIGNMENT',
                message: 'Task notification to keep',
                data: { taskId: keepTask.id }
            });

            await request(app)
                .patch(`/api/tasks/${notifiedTask.id}`)
                .send({ status: 'ACTIONED' })
                .set('Authorization', authToken)
                .expect(200);

            expect(await Notification.findByPk(removedNotification.id)).toBeNull();
            expect(await Notification.findByPk(keptNotification.id)).toBeDefined();
        });

        it('should allow a user to dismiss their own notification', async () => {
            const notification = await Notification.create({
                userId: 7,
                type: 'SYSTEM',
                message: 'Dismiss me',
                data: { wineryId: 1 }
            });

            await request(app)
                .delete(`/api/notifications/${notification.id}`)
                .set('Authorization', authToken)
                .expect(200);

            expect(await Notification.findByPk(notification.id)).toBeNull();
        });

        it('should allow staff to confirm a suggested customer match on an existing task', async () => {
            const { Member } = require('../../models');
            const existingMember = await Member.create({
                firstName: 'Review',
                lastName: 'Target',
                wineryId: winery.id,
                email: 'review-target@example.com'
            });

            const taskForReview = await Task.create({
                wineryId: winery.id,
                status: 'PENDING',
                category: 'ORDER',
                subType: 'ORDER_STATUS',
                customerType: 'VISITOR',
                payload: {
                    manualIntake: {
                        taskOrigin: 'EXTERNAL',
                        inboundMethod: 'email',
                        requesterName: 'Review Target',
                        requesterEmail: 'review-target+alias@example.com',
                        identityResolutionStatus: 'REVIEW_REQUIRED',
                        identityConfidence: 'LOW',
                        suggestedMemberId: existingMember.id,
                        suggestedMemberLabel: 'Review Target',
                        suggestedMemberReason: 'review:name_match'
                    }
                }
            });

            const res = await request(app)
                .patch(`/api/tasks/${taskForReview.id}`)
                .send({ memberId: existingMember.id })
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.task.memberId).toBe(existingMember.id);
            expect(res.body.task.customerType).toBe('MEMBER');
            expect(res.body.task.payload.manualIntake.identityResolutionStatus).toBe('REVIEW_CONFIRMED');
            expect(res.body.task.payload.manualIntake.memberMatchReason).toBe('review_confirmed');
        });

        it('should action an address-change task and record who did it', async () => {
            const member = await require('../../models').Member.create({
                firstName: 'Jane',
                lastName: 'Doe',
                wineryId: winery.id,
                phone: '+61400000001',
                addressLine1: '1 Old St',
                suburb: 'Old Town',
                state: 'SA',
                postcode: '5000'
            });

            const taskToApprove = await Task.create({
                type: 'ADDRESS_CHANGE',
                status: 'PENDING',
                wineryId: winery.id,
                memberId: member.id,
                payload: {
                    addressLine1: '2 New St',
                    suburb: 'New Town',
                    state: 'VIC',
                    postcode: '3000'
                }
            });

            const res = await request(app)
                .patch(`/api/tasks/${taskToApprove.id}`)
                .set('Authorization', authToken)
                .send({ status: 'ACTIONED' })
                .expect(200);

            expect(res.body.task.status).toBe('PENDING');
            expect(res.body.task.updatedBy).toBe(7); // Stub user ID

            const updated = await Task.findByPk(taskToApprove.id);
            expect(updated.status).toBe('PENDING');

            const { TaskAction } = require('../../models');
            const actioned = await TaskAction.findOne({
                where: { taskId: taskToApprove.id, actionType: 'ACTIONED', userId: 7 }
            });
            const executionTriggered = await TaskAction.findOne({
                where: { taskId: taskToApprove.id, actionType: 'EXECUTION_TRIGGERED' }
            });

            expect(actioned).toBeDefined();
            expect(executionTriggered).toBeDefined();
        });

        it('should execute ADDRESS_CHANGE by creating a secure link token', async () => {
            // Create Member
            const member = await require('../../models').Member.create({
                firstName: 'John',
                lastName: 'Doe',
                wineryId: winery.id,
                phone: '+61400000000',
                addressLine1: '1 Old St',
                suburb: 'Old Town',
                state: 'SA',
                postcode: '5000'
            });

            const task = await Task.create({
                type: 'ADDRESS_CHANGE',
                status: 'PENDING',
                wineryId: winery.id,
                memberId: member.id,
                payload: {
                    addressLine1: '2 New St',
                    suburb: 'New Town',
                    state: 'VIC',
                    postcode: '3000'
                }
            });

            await request(app)
                .patch(`/api/tasks/${task.id}`)
                .set('Authorization', authToken)
                .send({ status: 'ACTIONED' })
                .expect(200);

            const updatedTask = await Task.findByPk(task.id);
            expect(updatedTask.status).toBe('PENDING');

            const { MemberActionToken } = require('../../models');
            const token = await MemberActionToken.findOne({ where: { taskId: task.id } });
            expect(token).toBeDefined();

            // Member is not updated until confirmation
            const updatedMember = await require('../../models').Member.findByPk(member.id);
            expect(updatedMember.addressLine1).toBe('1 Old St');
        });

        it('should enrich a linked member record when an external order task is actioned', async () => {
            const { Member, TaskAction } = require('../../models');
            const member = await Member.create({
                firstName: 'Order',
                lastName: 'Customer',
                wineryId: winery.id,
                email: 'order@example.com',
                tags: []
            });

            const taskToAction = await Task.create({
                wineryId: winery.id,
                status: 'PENDING',
                category: 'ORDER',
                subType: 'ORDER_STATUS',
                memberId: member.id,
                payload: {
                    manualIntake: {
                        taskOrigin: 'EXTERNAL',
                        inboundMethod: 'email',
                        requesterEmail: 'order@example.com',
                        identityResolutionStatus: 'MANUALLY_LINKED',
                        identityConfidence: 'HIGH'
                    }
                }
            });

            await request(app)
                .patch(`/api/tasks/${taskToAction.id}`)
                .send({ status: 'ACTIONED' })
                .set('Authorization', authToken)
                .expect(200);

            const updatedMember = await Member.findByPk(member.id);
            expect(updatedMember.tags).toEqual(expect.arrayContaining(['order_contact', 'order_customer']));

            const enrichmentAction = await TaskAction.findOne({
                where: { taskId: taskToAction.id, actionType: 'MEMBER_ENRICHED' }
            });
            expect(enrichmentAction).toBeDefined();
        });

        it('should record explicit structured outcome and follow-up fields on closure', async () => {
            const dueAt = new Date('2026-04-25T02:30:00.000Z').toISOString();
            const res = await request(app)
                .patch(`/api/tasks/${task.id}`)
                .send({
                    status: 'REJECTED',
                    resolvedAs: 'DUPLICATE',
                    resolutionType: 'MERGED_DUPLICATE',
                    customerOutcome: 'NO_CHANGE',
                    resolutionSummary: 'Closed after merging into the active member case.',
                    followUpRequired: true,
                    followUpDueAt: dueAt,
                    followUpSummary: 'Check the surviving case after the merge settles.'
                })
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.task.status).toBe('REJECTED');
            expect(res.body.task.resolvedAs).toBe('DUPLICATE');
            expect(res.body.task.resolutionType).toBe('MERGED_DUPLICATE');
            expect(res.body.task.customerOutcome).toBe('NO_CHANGE');
            expect(res.body.task.followUpRequired).toBe(true);
            expect(new Date(res.body.task.followUpDueAt).toISOString()).toBe(dueAt);
            expect(res.body.task.followUpSummary).toMatch(/surviving case/i);

            const { TaskAction } = require('../../models');
            const outcomeAction = await TaskAction.findOne({
                where: { taskId: task.id, actionType: 'OUTCOME_RECORDED' }
            });
            expect(outcomeAction).toBeDefined();
            expect(outcomeAction.details.changes.resolvedAs).toBe('DUPLICATE');

            const followUpTask = await Task.findOne({
                where: {
                    parentTaskId: task.id,
                    status: 'PENDING'
                }
            });
            expect(followUpTask).toBeDefined();
            expect(followUpTask.payload.followUpAutomation.isAutoGenerated).toBe(true);
            expect(followUpTask.payload.followUpAutomation.automationType).toBe('EXPLICIT_FOLLOW_UP');
            expect(new Date(followUpTask.dueAt).toISOString()).toBe(dueAt);
            expect(followUpTask.payload.summary).toMatch(/surviving case/i);

            const taskDetailRes = await request(app)
                .get(`/api/tasks/${task.id}`)
                .set('Authorization', authToken)
                .expect(200);

            expect(taskDetailRes.body.task.SubTasks).toHaveLength(1);
            expect(taskDetailRes.body.task.SubTasks[0].id).toBe(followUpTask.id);

            const reminder = await Notification.findOne({
                where: {
                    type: 'SYSTEM'
                },
                order: [['id', 'DESC']]
            });
            expect(reminder).toBeDefined();
            expect(reminder.data.taskId).toBe(followUpTask.id);
            expect(reminder.data.parentTaskId).toBe(task.id);
        });

        it('should clear structured outcome fields when a closed task is reopened', async () => {
            const closedTask = await Task.create({
                wineryId: winery.id,
                status: 'ACTIONED',
                category: 'GENERAL',
                subType: 'GENERAL_ENQUIRY',
                resolvedAs: 'COMPLETED',
                resolutionType: 'REPLIED',
                customerOutcome: 'INFO_PROVIDED',
                resolutionSummary: 'Initial resolution',
                followUpRequired: true,
                followUpDueAt: new Date('2026-04-26T02:30:00.000Z'),
                followUpSummary: 'Follow up later',
                resolvedAt: new Date('2026-04-20T02:30:00.000Z')
            });

            const res = await request(app)
                .patch(`/api/tasks/${closedTask.id}`)
                .send({ status: 'PENDING' })
                .set('Authorization', authToken)
                .expect(200);

            expect(res.body.task.status).toBe('PENDING');
            expect(res.body.task.resolvedAs).toBeNull();
            expect(res.body.task.resolutionType).toBeNull();
            expect(res.body.task.customerOutcome).toBeNull();
            expect(res.body.task.resolutionSummary).toBeNull();
            expect(res.body.task.followUpRequired).toBe(false);
            expect(res.body.task.followUpDueAt).toBeNull();
            expect(res.body.task.followUpSummary).toBeNull();
            expect(res.body.task.resolvedAt).toBeNull();
        });

        it('should cancel a pending automated follow-up task when the parent task is reopened', async () => {
            const taskForReopen = await Task.create({
                wineryId: winery.id,
                status: 'PENDING',
                category: 'GENERAL',
                subType: 'GENERAL_ENQUIRY',
                assigneeId: 7
            });

            await request(app)
                .patch(`/api/tasks/${taskForReopen.id}`)
                .send({
                    status: 'ACTIONED',
                    resolvedAs: 'COMPLETED',
                    resolutionType: 'REPLIED',
                    customerOutcome: 'INFO_PROVIDED',
                    followUpRequired: true,
                    followUpDueAt: new Date('2026-04-28T02:30:00.000Z').toISOString(),
                    followUpSummary: 'Call back to confirm they received the answer.'
                })
                .set('Authorization', authToken)
                .expect(200);

            const followUpTask = await Task.findOne({
                where: {
                    parentTaskId: taskForReopen.id,
                    status: 'PENDING'
                }
            });
            expect(followUpTask).toBeDefined();

            await request(app)
                .patch(`/api/tasks/${taskForReopen.id}`)
                .send({ status: 'PENDING' })
                .set('Authorization', authToken)
                .expect(200);

            const cancelledFollowUpTask = await Task.findByPk(followUpTask.id);
            expect(cancelledFollowUpTask.status).toBe('REJECTED');
            expect(cancelledFollowUpTask.resolutionType).toBe('ALREADY_RESOLVED');
            expect(cancelledFollowUpTask.customerOutcome).toBe('NO_CHANGE');
        });

        it('should auto-create a callback follow-up when an external task closes with customer no response', async () => {
            const member = await require('../../models').Member.create({
                firstName: 'Callback',
                lastName: 'Customer',
                wineryId: winery.id,
                email: 'callback@example.com'
            });

            const noResponseTask = await Task.create({
                wineryId: winery.id,
                status: 'PENDING',
                category: 'GENERAL',
                subType: 'GENERAL_ENQUIRY',
                customerType: 'MEMBER',
                memberId: member.id,
                assigneeId: 7,
                payload: {
                    manualIntake: {
                        taskOrigin: 'EXTERNAL',
                        inboundMethod: 'email',
                        requesterEmail: 'callback@example.com',
                        identityResolutionStatus: 'MANUALLY_LINKED',
                        identityConfidence: 'HIGH'
                    }
                }
            });

            await request(app)
                .patch(`/api/tasks/${noResponseTask.id}`)
                .send({
                    status: 'ACTIONED',
                    resolvedAs: 'WORKAROUND',
                    resolutionType: 'CUSTOMER_NO_RESPONSE',
                    customerOutcome: 'NO_CHANGE'
                })
                .set('Authorization', authToken)
                .expect(200);

            const callbackFollowUp = await Task.findOne({
                where: {
                    parentTaskId: noResponseTask.id,
                    status: 'PENDING'
                }
            });

            expect(callbackFollowUp).toBeDefined();
            expect(callbackFollowUp.payload.followUpAutomation.automationType).toBe('CUSTOMER_NO_RESPONSE_CALLBACK');
            expect(callbackFollowUp.subType).toMatch(/CALLBACK/);
            expect(callbackFollowUp.assigneeId).toBe(7);
        });
    });

    describe('Task Step Routes', () => {
        let task;

        beforeEach(async () => {
            await User.update({ role: 'manager' }, { where: { id: 7 } });
            task = await Task.create({
                wineryId: winery.id,
                status: 'PENDING',
                category: 'GENERAL'
            });
        });

        afterEach(async () => {
            await User.update({ role: 'manager' }, { where: { id: 7 } });
        });

        it('should create, update, and return task steps', async () => {
            const createRes = await request(app)
                .post(`/api/tasks/${task.id}/steps`)
                .set('Authorization', authToken)
                .send({
                    title: 'Collect missing detail',
                    description: 'Need the customer order number before replying.',
                    stepType: 'CUSTOMER_WAIT',
                    waitingOn: 'CUSTOMER'
                })
                .expect(201);

            expect(createRes.body.step.title).toBe('Collect missing detail');

            const updateRes = await request(app)
                .patch(`/api/tasks/${task.id}/steps/${createRes.body.step.id}`)
                .set('Authorization', authToken)
                .send({
                    status: 'BLOCKED',
                    blockedReason: 'Awaiting reply from customer'
                })
                .expect(200);

            expect(updateRes.body.step.status).toBe('BLOCKED');

            const taskRes = await request(app)
                .get(`/api/tasks/${task.id}`)
                .set('Authorization', authToken)
                .expect(200);

            expect(taskRes.body.task.workflowState).toBe('BLOCKED');
            expect(taskRes.body.task.waitingOn).toBe('CUSTOMER');
            expect(taskRes.body.task.TaskSteps).toHaveLength(1);
            expect(taskRes.body.task.TaskSteps[0].blockedReason).toBe('Awaiting reply from customer');
        });

        it('should allow staff to complete a workflow step on a task assigned to them', async () => {
            await User.update({ role: 'staff' }, { where: { id: 7 } });
            await task.update({ assigneeId: 7 });
            const step = await TaskStep.create({
                taskId: task.id,
                title: 'Assigned staff step',
                stepType: 'INTERNAL',
                waitingOn: 'STAFF',
                sortOrder: 0
            });

            const res = await request(app)
                .patch(`/api/tasks/${task.id}/steps/${step.id}`)
                .set('Authorization', authToken)
                .send({
                    status: 'COMPLETED',
                    completionNotes: 'Done by assigned staff',
                    waitingOn: 'NONE'
                })
                .expect(200);

            expect(res.body.step.status).toBe('COMPLETED');
        });

        it('should allow staff to complete a workflow step on an unassigned task', async () => {
            await User.update({ role: 'staff' }, { where: { id: 7 } });
            await task.update({ assigneeId: null });
            const step = await TaskStep.create({
                taskId: task.id,
                title: 'Unassigned task step',
                stepType: 'INTERNAL',
                waitingOn: 'STAFF',
                sortOrder: 0
            });

            const res = await request(app)
                .patch(`/api/tasks/${task.id}/steps/${step.id}`)
                .set('Authorization', authToken)
                .send({
                    status: 'COMPLETED',
                    waitingOn: 'NONE'
                })
                .expect(200);

            expect(res.body.step.status).toBe('COMPLETED');
        });

        it('should prevent staff from adding workflow steps to a task assigned to another staff member', async () => {
            await User.update({ role: 'staff' }, { where: { id: 7 } });
            const [otherStaff] = await User.findOrCreate({
                where: { id: 106 },
                defaults: {
                    firebaseUid: 'create-step-other-staff-106',
                    email: 'create-step-other-staff@example.com',
                    displayName: 'Create Step Other Staff',
                    role: 'staff',
                    wineryId: winery.id
                }
            });
            await task.update({ assigneeId: otherStaff.id });

            const res = await request(app)
                .post(`/api/tasks/${task.id}/steps`)
                .set('Authorization', authToken)
                .send({
                    title: 'Should not be created',
                    stepType: 'INTERNAL',
                    waitingOn: 'STAFF'
                })
                .expect(403);

            expect(res.body.error.code).toBe('STEP_ACTION_FORBIDDEN');
        });

        it('should prevent staff from completing a workflow step on a task assigned to another staff member', async () => {
            await User.update({ role: 'staff' }, { where: { id: 7 } });
            const [otherStaff] = await User.findOrCreate({
                where: { id: 107 },
                defaults: {
                    firebaseUid: 'other-step-staff-107',
                    email: 'other-step-staff@example.com',
                    displayName: 'Other Step Staff',
                    role: 'staff',
                    wineryId: winery.id
                }
            });
            await task.update({ assigneeId: otherStaff.id });
            const step = await TaskStep.create({
                taskId: task.id,
                title: 'Other assigned task step',
                stepType: 'INTERNAL',
                waitingOn: 'STAFF',
                sortOrder: 0
            });

            const res = await request(app)
                .patch(`/api/tasks/${task.id}/steps/${step.id}`)
                .set('Authorization', authToken)
                .send({ status: 'COMPLETED' })
                .expect(403);

            expect(res.body.error.code).toBe('STEP_ACTION_FORBIDDEN');
        });

        it('should prevent the task assignee from completing a step owned by another staff member', async () => {
            await User.update({ role: 'staff' }, { where: { id: 7 } });
            const [otherStaff] = await User.findOrCreate({
                where: { id: 108 },
                defaults: {
                    firebaseUid: 'step-owner-108',
                    email: 'step-owner@example.com',
                    displayName: 'Step Owner',
                    role: 'staff',
                    wineryId: winery.id
                }
            });
            await task.update({ assigneeId: 7 });
            const step = await TaskStep.create({
                taskId: task.id,
                title: 'Owned by someone else',
                stepType: 'INTERNAL',
                waitingOn: 'STAFF',
                ownerUserId: otherStaff.id,
                sortOrder: 0
            });

            const res = await request(app)
                .patch(`/api/tasks/${task.id}/steps/${step.id}`)
                .set('Authorization', authToken)
                .send({ status: 'COMPLETED' })
                .expect(403);

            expect(res.body.error.message).toMatch(/assigned to another staff member/i);
        });

        it('should allow managers to override workflow step ownership restrictions', async () => {
            const [otherStaff] = await User.findOrCreate({
                where: { id: 109 },
                defaults: {
                    firebaseUid: 'manager-override-step-owner-109',
                    email: 'manager-override-step-owner@example.com',
                    displayName: 'Override Step Owner',
                    role: 'staff',
                    wineryId: winery.id
                }
            });
            await task.update({ assigneeId: otherStaff.id });
            const step = await TaskStep.create({
                taskId: task.id,
                title: 'Manager override step',
                stepType: 'INTERNAL',
                waitingOn: 'STAFF',
                ownerUserId: otherStaff.id,
                sortOrder: 0
            });

            const res = await request(app)
                .patch(`/api/tasks/${task.id}/steps/${step.id}`)
                .set('Authorization', authToken)
                .send({ status: 'COMPLETED', waitingOn: 'NONE' })
                .expect(200);

            expect(res.body.step.status).toBe('COMPLETED');
        });

        it('should allow managers to reorder workflow steps atomically', async () => {
            const first = await TaskStep.create({
                taskId: task.id,
                title: 'First step',
                stepType: 'INTERNAL',
                waitingOn: 'STAFF',
                sortOrder: 0
            });
            const second = await TaskStep.create({
                taskId: task.id,
                title: 'Second step',
                stepType: 'INTERNAL',
                waitingOn: 'STAFF',
                sortOrder: 1
            });
            const third = await TaskStep.create({
                taskId: task.id,
                title: 'Third step',
                stepType: 'INTERNAL',
                waitingOn: 'STAFF',
                sortOrder: 2
            });

            const res = await request(app)
                .patch(`/api/tasks/${task.id}/steps/reorder`)
                .set('Authorization', authToken)
                .send({ stepIds: [third.id, first.id, second.id] })
                .expect(200);

            expect(res.body.steps.map(step => step.id)).toEqual([third.id, first.id, second.id]);
            expect(res.body.steps.map(step => step.sortOrder)).toEqual([0, 1, 2]);

            const taskRes = await request(app)
                .get(`/api/tasks/${task.id}`)
                .set('Authorization', authToken)
                .expect(200);

            expect(taskRes.body.task.TaskSteps.map(step => step.id)).toEqual([third.id, first.id, second.id]);
        });

        it('should generate a draft suggestion for an individual task step', async () => {
            const member = await Member.create({
                wineryId: winery.id,
                firstName: 'Step',
                lastName: 'Customer',
                email: 'step-customer@example.com'
            });
            await task.update({
                memberId: member.id,
                subType: 'GENERAL_ENQUIRY',
                suggestedChannel: 'email'
            });
            const step = await TaskStep.create({
                taskId: task.id,
                title: 'Reply to customer',
                description: 'Confirm the team has received the request.',
                stepType: 'CUSTOMER_MESSAGE',
                waitingOn: 'STAFF',
                sortOrder: 0
            });

            const res = await request(app)
                .post(`/api/tasks/${task.id}/steps/${step.id}/suggestion`)
                .set('Authorization', authToken)
                .send({ force: true })
                .expect(200);

            expect(res.body.step.suggestionStatus).toBe('DRAFT');
            expect(res.body.step.suggestedChannel).toBe('email');
            expect(res.body.step.suggestedRecipientEmail).toBe('step-customer@example.com');
            expect(res.body.step.suggestedReplyBody).toBeTruthy();

            const action = await TaskAction.findOne({
                where: {
                    taskId: task.id,
                    actionType: 'STEP_UPDATED'
                },
                order: [['createdAt', 'DESC']]
            });
            expect(action.details.source).toBe('STEP_SUGGESTION_GENERATED');
        });

        it('should return a fallback step suggestion when AI generation fails', async () => {
            const aiService = require('../../services/ai');
            const generateSpy = jest.spyOn(aiService, 'generate').mockRejectedValueOnce(new Error('AI unavailable'));
            const step = await TaskStep.create({
                taskId: task.id,
                title: 'Internal review',
                description: 'Check the request before replying.',
                stepType: 'INTERNAL',
                waitingOn: 'STAFF',
                sortOrder: 0
            });

            const res = await request(app)
                .post(`/api/tasks/${task.id}/steps/${step.id}/suggestion`)
                .set('Authorization', authToken)
                .send({ force: true })
                .expect(200);

            expect(res.body.step.suggestionStatus).toBe('DRAFT');
            expect(res.body.step.suggestedChannel).toBe('none');
            expect(res.body.step.suggestedReplyBody).toContain('Internal review');
            expect(res.body.step.suggestionError).toContain('Fallback draft used');

            generateSpy.mockRestore();
        });

        it('should action a step suggestion, send email, and complete the step', async () => {
            const member = await Member.create({
                wineryId: winery.id,
                firstName: 'Email',
                lastName: 'Customer',
                email: 'email-customer@example.com'
            });
            await task.update({
                memberId: member.id,
                subType: 'GENERAL_ENQUIRY'
            });
            const step = await TaskStep.create({
                taskId: task.id,
                title: 'Send customer update',
                stepType: 'CUSTOMER_MESSAGE',
                waitingOn: 'STAFF',
                sortOrder: 0,
                suggestedChannel: 'email',
                suggestedRecipientEmail: 'email-customer@example.com',
                suggestedReplySubject: 'Update from the winery',
                suggestedReplyBody: 'Thanks for your note. We are looking into this now.',
                suggestionStatus: 'DRAFT'
            });

            const res = await request(app)
                .post(`/api/tasks/${task.id}/steps/${step.id}/action`)
                .set('Authorization', authToken)
                .send({
                    suggestedChannel: 'email',
                    suggestedRecipientEmail: 'email-customer@example.com',
                    suggestedReplySubject: 'Update from the winery',
                    suggestedReplyBody: 'Thanks for your note. We are looking into this now.',
                    completeStep: true
                })
                .expect(200);

            expect(res.body.step.status).toBe('COMPLETED');
            expect(res.body.step.suggestionStatus).toBe('SENT');
            expect(res.body.providerResult.status).toBe('queued');

            const outboundMessage = await Message.findOne({
                where: {
                    taskId: task.id,
                    direction: 'outbound',
                    source: 'email'
                }
            });
            expect(outboundMessage).toBeDefined();
            expect(outboundMessage.subject).toBe('Update from the winery');

            const action = await TaskAction.findOne({
                where: {
                    taskId: task.id,
                    actionType: 'STEP_COMPLETED'
                },
                order: [['createdAt', 'DESC']]
            });
            expect(action.details.source).toBe('STEP_SUGGESTION_ACTIONED');
        });
    });
});
