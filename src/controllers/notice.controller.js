const noticeService = require('../services/notice.service');
const {
  validate,
  createNoticeSchema,
  updateNoticeSchema,
  noticeCommentCreateSchema,
  noticeTaskLinkSchema
} = require('../utils/validation');

async function listNotices(req, res, next) {
  try {
    const { wineryId } = req.user;
    const {
      search,
      category,
      priority,
      authorId,
      areaId,
      pinned,
      status,
      dateFrom,
      dateTo,
      effectiveFrom,
      effectiveTo,
      sortBy,
      page,
      pageSize
    } = req.query;

    const result = await noticeService.listNotices({
      wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      filters: {
        search,
        category,
        priority,
        authorId,
        areaId,
        pinned,
        status,
        dateFrom,
        dateTo,
        effectiveFrom,
        effectiveTo,
        sortBy
      },
      pagination: { page, pageSize }
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getNotice(req, res, next) {
  try {
    const notice = await noticeService.getNoticeById({
      noticeId: req.params.id,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });

    res.json({ notice });
  } catch (err) {
    next(err);
  }
}

async function createNotice(req, res, next) {
  try {
    const data = validate(createNoticeSchema, req.body);
    const notice = await noticeService.createNotice({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      data
    });

    res.status(201).json({ notice });
  } catch (err) {
    next(err);
  }
}

async function updateNotice(req, res, next) {
  try {
    const updates = validate(updateNoticeSchema, req.body);
    const notice = await noticeService.updateNotice({
      noticeId: req.params.id,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      updates
    });

    res.json({ notice });
  } catch (err) {
    next(err);
  }
}

async function archiveNotice(req, res, next) {
  try {
    const notice = await noticeService.archiveNotice({
      noticeId: req.params.id,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });

    res.json({ notice });
  } catch (err) {
    next(err);
  }
}

async function linkTask(req, res, next) {
  try {
    const { taskId } = validate(noticeTaskLinkSchema, req.body);
    const notice = await noticeService.linkNoticeTask({
      noticeId: req.params.id,
      taskId,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });

    res.status(201).json({ notice });
  } catch (err) {
    next(err);
  }
}

async function unlinkTask(req, res, next) {
  try {
    const notice = await noticeService.unlinkNoticeTask({
      noticeId: req.params.id,
      taskId: req.params.taskId,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });

    res.json({ notice });
  } catch (err) {
    next(err);
  }
}

async function listComments(req, res, next) {
  try {
    const comments = await noticeService.listNoticeComments({
      noticeId: req.params.id,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });

    res.json({ comments });
  } catch (err) {
    next(err);
  }
}

async function createComment(req, res, next) {
  try {
    const data = validate(noticeCommentCreateSchema, req.body);
    const comment = await noticeService.createNoticeComment({
      noticeId: req.params.id,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      data
    });

    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
}

async function deleteComment(req, res, next) {
  try {
    await noticeService.deleteNoticeComment({
      noticeId: req.params.id,
      commentId: req.params.commentId,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function acknowledgeNotice(req, res, next) {
  try {
    const notice = await noticeService.acknowledgeNotice({
      noticeId: req.params.id,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });
    res.json({ notice });
  } catch (err) {
    next(err);
  }
}

async function listAcknowledgements(req, res, next) {
  try {
    const acknowledgement = await noticeService.getNoticeAcknowledgements({
      noticeId: req.params.id,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });
    res.json({ acknowledgement });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listNotices,
  getNotice,
  createNotice,
  updateNotice,
  archiveNotice,
  linkTask,
  unlinkTask,
  listComments,
  createComment,
  deleteComment,
  acknowledgeNotice,
  listAcknowledgements
};
