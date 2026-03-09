const { Member, Task, Message } = require('../models');
const { Op } = require('sequelize');
const { validate, createMemberSchema, updateMemberSchema } = require('../utils/validation');
const AppError = require('../utils/AppError');

// --- LIST (paginated, filterable) ---
async function listMembers(req, res, next) {
    try {
        const { wineryId } = req.user;
        const { q, source, tag, loyaltyTier, isWineClubMember, sortBy, page = 1, limit = 50 } = req.query;

        const where = { wineryId };

        // Search across name, email, phone
        if (q && q.length >= 2) {
            where[Op.or] = [
                { firstName: { [Op.like]: `%${q}%` } },
                { lastName: { [Op.like]: `%${q}%` } },
                { email: { [Op.like]: `%${q}%` } },
                { phone: { [Op.like]: `%${q}%` } }
            ];
        }

        if (source && source !== 'all') where.source = source;
        if (loyaltyTier && loyaltyTier !== 'all') where.loyaltyTier = loyaltyTier;
        if (isWineClubMember === 'true') where.isWineClubMember = true;

        // Determine sort order
        let order = [['lastName', 'ASC'], ['firstName', 'ASC']];
        if (sortBy === 'newest') order = [['createdAt', 'DESC']];
        if (sortBy === 'oldest') order = [['createdAt', 'ASC']];
        if (sortBy === 'lastContact') order = [['lastContactAt', 'DESC']];
        if (sortBy === 'highestSpend') order = [['lifetimeSpend', 'DESC']];
        if (sortBy === 'mostVisits') order = [['visitCount', 'DESC']];

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Member.findAndCountAll({
            where,
            order,
            limit: parseInt(limit),
            offset,
            attributes: {
                include: [
                    [
                        require('sequelize').literal(
                            '(SELECT COUNT(*) FROM Tasks WHERE Tasks.memberId = Member.id)'
                        ),
                        'taskCount'
                    ]
                ]
            }
        });

        res.json({
            members: rows,
            total: count,
            page: parseInt(page),
            totalPages: Math.ceil(count / parseInt(limit))
        });
    } catch (err) {
        next(err);
    }
}

// --- GET SINGLE ---
async function getMember(req, res, next) {
    try {
        const { wineryId } = req.user;
        const member = await Member.findOne({
            where: { id: req.params.id, wineryId },
            include: [
                {
                    model: Task,
                    attributes: ['id', 'category', 'subType', 'status', 'priority', 'createdAt'],
                    limit: 10,
                    order: [['createdAt', 'DESC']]
                }
            ]
        });

        if (!member) throw new AppError('Customer not found', 404, 'NOT_FOUND');

        res.json({ member });
    } catch (err) {
        next(err);
    }
}

// --- SEARCH (existing, kept for backwards compatibility) ---
async function searchMembers(req, res, next) {
    try {
        const { wineryId } = req.user;
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json({ members: [] });
        }

        const members = await Member.findAll({
            where: {
                wineryId,
                [Op.or]: [
                    { firstName: { [Op.like]: `%${q}%` } },
                    { lastName: { [Op.like]: `%${q}%` } },
                    { email: { [Op.like]: `%${q}%` } },
                    { phone: { [Op.like]: `%${q}%` } }
                ]
            },
            limit: 20,
            attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
        });

        res.json({ members });
    } catch (err) {
        next(err);
    }
}

// --- CREATE ---
async function createMember(req, res, next) {
    try {
        const payload = validate(createMemberSchema, req.body);
        const member = await Member.create({ ...payload, wineryId: req.user.wineryId });
        res.status(201).json({ success: true, member });
    } catch (err) {
        next(err);
    }
}

// --- UPDATE ---
async function updateMember(req, res, next) {
    try {
        const payload = validate(updateMemberSchema, req.body);
        const member = await Member.findOne({
            where: { id: req.params.id, wineryId: req.user.wineryId }
        });
        if (!member) throw new AppError('Customer not found', 404, 'NOT_FOUND');

        await member.update(payload);
        res.json({ success: true, member });
    } catch (err) {
        next(err);
    }
}

// --- DELETE ---
async function deleteMember(req, res, next) {
    try {
        const { id } = req.params;
        const destroyed = await Member.destroy({
            where: { id, wineryId: req.user.wineryId }
        });
        if (!destroyed) throw new AppError('Customer not found', 404, 'NOT_FOUND');
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listMembers,
    getMember,
    searchMembers,
    createMember,
    updateMember,
    deleteMember
};
