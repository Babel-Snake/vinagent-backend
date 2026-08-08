const { Member, Message, Task, TaskAction, TaskStep, User } = require('../models');
const noticeService = require('./notice.service');
const recordVisibility = require('./recordVisibility.service');
const taskDeadlineService = require('./taskDeadline.service');
const { getTaskAreaInclude } = require('./taskArea.service');

async function getTaskById({ taskId, wineryId, userId = null, userRole = null }) {
  const task = await Task.findOne({
    where: { id: taskId, wineryId },
    include: [
      { model: Member, where: { wineryId }, required: false },
      { model: Message, where: { wineryId }, required: false },
      {
        model: Task,
        as: 'ParentTask',
        where: { wineryId },
        required: false,
        attributes: ['id', 'category', 'subType', 'status', 'resolvedAs', 'resolutionType', 'customerOutcome', 'resolvedAt']
      },
      {
        model: Message,
        as: 'Messages',
        where: { wineryId },
        separate: true,
        order: [['receivedAt', 'ASC'], ['id', 'ASC']],
        limit: 100
      },
      { model: User, as: 'Creator', where: { wineryId }, attributes: ['id', 'displayName'], required: false },
      { model: User, as: 'Assignee', where: { wineryId }, attributes: ['id', 'displayName', 'email', 'role'], required: false },
      getTaskAreaInclude(wineryId),
      {
        model: TaskStep,
        as: 'TaskSteps',
        separate: true,
        order: [['sortOrder', 'ASC'], ['id', 'ASC']],
        include: [{ model: User, as: 'Owner', where: { wineryId }, attributes: ['id', 'displayName', 'email', 'role'], required: false }]
      },
      {
        model: TaskAction,
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 50,
        include: [{ model: User, where: { wineryId }, attributes: ['id', 'displayName', 'role'], required: false }]
      },
      {
        model: Task,
        as: 'SubTasks',
        where: { wineryId },
        separate: true,
        order: [['dueAt', 'ASC'], ['id', 'ASC']],
        include: [
          { model: User, as: 'Assignee', where: { wineryId }, attributes: ['id', 'displayName', 'email', 'role'], required: false },
          { model: Member, where: { wineryId }, attributes: ['id', 'firstName', 'lastName', 'email', 'phone'], required: false }
        ]
      },
      noticeService.getLinkedNoticeInclude(wineryId)
    ]
  });

  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (userId && userRole) {
    await recordVisibility.assertCanViewTask(task, { wineryId, userId, userRole });
    const visibleNotices = [];
    for (const notice of task.LinkedNotices || []) {
      if (await recordVisibility.canViewNotice(notice, { wineryId, userId, userRole })) {
        visibleNotices.push(notice);
      }
    }
    task.setDataValue('LinkedNotices', visibleNotices);
  }

  return taskDeadlineService.attachDeadlineState(task);
}

module.exports = {
  getTaskById
};
