const { Member, Task, Message, MemberActionToken, sequelize } = require('../models');
const { Op } = require('sequelize');
const { validate, createMemberSchema, updateMemberSchema, mergeMemberSchema } = require('../utils/validation');
const AppError = require('../utils/AppError');

const LOYALTY_RANK = { none: 0, bronze: 1, silver: 2, gold: 3, platinum: 4 };

function normalizeMemberType(payload, inferMissing = true) {
    const next = { ...payload };
    if (!next.customerType && inferMissing) {
        next.customerType = next.isWineClubMember ? 'member' : 'guest';
    }

    if (next.customerType === 'member') {
        next.isWineClubMember = true;
    } else if (next.customerType === 'guest' || next.customerType === 'tour_operator') {
        next.isWineClubMember = false;
    }

    return next;
}

function choosePreferredValue(targetValue, sourceValue, preference = 'target') {
    if (preference === 'source') return sourceValue ?? targetValue ?? null;
    if (targetValue !== undefined && targetValue !== null && targetValue !== '') return targetValue;
    return sourceValue ?? targetValue ?? null;
}

function pickLatestDate(dateA, dateB) {
    if (!dateA) return dateB || null;
    if (!dateB) return dateA || null;
    return new Date(dateA) > new Date(dateB) ? dateA : dateB;
}

function mergeNotes(targetNotes, sourceNotes, preference = 'combine') {
    if (preference === 'target') return targetNotes || null;
    if (preference === 'source') return sourceNotes || null;
    if (!targetNotes) return sourceNotes || null;
    if (!sourceNotes) return targetNotes || null;
    if (targetNotes.includes(sourceNotes)) return targetNotes;
    return `${targetNotes}\n\nMerged notes:\n${sourceNotes}`;
}

// --- LIST (paginated, filterable) ---
async function listMembers(req, res, next) {
    try {
        const { wineryId } = req.user;
        const { q, source, state, loyaltyTier, isWineClubMember, customerType, sortBy, page = 1, limit = 50 } = req.query;
        const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

        const where = { wineryId };

        // Search across name, email, phone
        if (q && q.length >= 2) {
            where[Op.or] = [
                { firstName: { [Op.like]: `%${q}%` } },
                { lastName: { [Op.like]: `%${q}%` } },
                { email: { [Op.like]: `%${q}%` } },
                { phone: { [Op.like]: `%${q}%` } },
                { addressLine1: { [Op.like]: `%${q}%` } },
                { addressLine2: { [Op.like]: `%${q}%` } },
                { suburb: { [Op.like]: `%${q}%` } },
                { state: { [Op.like]: `%${q}%` } },
                { postcode: { [Op.like]: `%${q}%` } }
            ];
        }

        if (source && source !== 'all') where.source = source;
        if (state && state !== 'all') where.state = state;
        if (loyaltyTier && loyaltyTier !== 'all') where.loyaltyTier = loyaltyTier;
        if (customerType === 'members' || isWineClubMember === 'true') where.isWineClubMember = true;
        if (customerType === 'guests' || isWineClubMember === 'false') {
            where.customerType = 'guest';
        }
        if (customerType === 'tour_operators') {
            where.customerType = 'tour_operator';
        }

        // Determine sort order
        let order = [['lastName', 'ASC'], ['firstName', 'ASC']];
        if (sortBy === 'newest') order = [['createdAt', 'DESC']];
        if (sortBy === 'oldest') order = [['createdAt', 'ASC']];
        if (sortBy === 'lastContact') order = [['lastContactAt', 'DESC']];
        if (sortBy === 'highestSpend') order = [['lifetimeSpend', 'DESC']];
        if (sortBy === 'mostVisits') order = [['visitCount', 'DESC']];

        const offset = (parsedPage - 1) * parsedLimit;

        const { count, rows } = await Member.findAndCountAll({
            where,
            order,
            limit: parsedLimit,
            offset,
            attributes: {
                include: [
                    [
                        require('sequelize').literal(
                            '(SELECT COUNT(*) FROM Tasks WHERE Tasks.memberId = Member.id AND Tasks.wineryId = Member.wineryId)'
                        ),
                        'taskCount'
                    ]
                ]
            }
        });

        res.json({
            members: rows,
            total: count,
            page: parsedPage,
            limit: parsedLimit,
            totalPages: Math.ceil(count / parsedLimit)
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
                    where: { wineryId },
                    attributes: ['id', 'category', 'subType', 'status', 'priority', 'createdAt'],
                    required: false,
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
                    { phone: { [Op.like]: `%${q}%` } },
                    { addressLine1: { [Op.like]: `%${q}%` } },
                    { addressLine2: { [Op.like]: `%${q}%` } },
                    { suburb: { [Op.like]: `%${q}%` } },
                    { state: { [Op.like]: `%${q}%` } },
                    { postcode: { [Op.like]: `%${q}%` } }
                ]
            },
            limit: 20,
            attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'addressLine1', 'addressLine2', 'suburb', 'state', 'postcode', 'country']
        });

        res.json({ members });
    } catch (err) {
        next(err);
    }
}

// --- CREATE ---
async function createMember(req, res, next) {
    try {
        if (Object.prototype.hasOwnProperty.call(req.body, 'wineryId')) {
            throw new AppError(
                'Winery assignment is controlled by the authenticated account.',
                400,
                'IMMUTABLE_WINERY'
            );
        }
        const payload = normalizeMemberType(validate(createMemberSchema, req.body));
        const member = await Member.create({ ...payload, wineryId: req.user.wineryId });
        res.status(201).json({ success: true, member });
    } catch (err) {
        next(err);
    }
}

// --- UPDATE ---
async function updateMember(req, res, next) {
    try {
        if (Object.prototype.hasOwnProperty.call(req.body, 'wineryId')) {
            throw new AppError('Customer winery assignment cannot be changed.', 400, 'IMMUTABLE_WINERY');
        }
        const payload = validate(updateMemberSchema, req.body);
        if (req.body.customerType === undefined) delete payload.customerType;
        if (req.body.isWineClubMember === undefined) delete payload.isWineClubMember;
        const normalizedPayload = normalizeMemberType(payload, false);
        const member = await Member.findOne({
            where: { id: req.params.id, wineryId: req.user.wineryId }
        });
        if (!member) throw new AppError('Customer not found', 404, 'NOT_FOUND');

        await member.update(normalizedPayload);
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

async function mergeMember(req, res, next) {
    const transaction = await sequelize.transaction();
    try {
        const wineryId = req.user.wineryId;
        const targetMemberId = Number(req.params.id);
        const payload = validate(mergeMemberSchema, req.body);
        const sourceMemberId = Number(payload.sourceMemberId);

        if (targetMemberId === sourceMemberId) {
            throw new AppError('Cannot merge a customer into itself', 400, 'INVALID_MERGE');
        }

        const [targetMember, sourceMember] = await Promise.all([
            Member.findOne({ where: { id: targetMemberId, wineryId }, transaction }),
            Member.findOne({ where: { id: sourceMemberId, wineryId }, transaction })
        ]);

        if (!targetMember || !sourceMember) {
            throw new AppError('Customer not found', 404, 'NOT_FOUND');
        }

        const overrides = payload.fieldOverrides || {};
        const mergedTags = Array.from(new Set([...(targetMember.tags || []), ...(sourceMember.tags || [])]));
        const mergedWinePreferences = {
            ...(sourceMember.winePreferences || {}),
            ...(targetMember.winePreferences || {})
        };

        targetMember.firstName = choosePreferredValue(targetMember.firstName, sourceMember.firstName, overrides.firstName);
        targetMember.lastName = choosePreferredValue(targetMember.lastName, sourceMember.lastName, overrides.lastName);
        targetMember.email = choosePreferredValue(targetMember.email, sourceMember.email, overrides.email);
        targetMember.phone = choosePreferredValue(targetMember.phone, sourceMember.phone, overrides.phone);
        targetMember.addressLine1 = choosePreferredValue(targetMember.addressLine1, sourceMember.addressLine1, overrides.addressLine1);
        targetMember.addressLine2 = choosePreferredValue(targetMember.addressLine2, sourceMember.addressLine2, overrides.addressLine2);
        targetMember.suburb = choosePreferredValue(targetMember.suburb, sourceMember.suburb, overrides.suburb);
        targetMember.state = choosePreferredValue(targetMember.state, sourceMember.state, overrides.state);
        targetMember.postcode = choosePreferredValue(targetMember.postcode, sourceMember.postcode, overrides.postcode);
        targetMember.country = choosePreferredValue(targetMember.country, sourceMember.country, overrides.country);
        targetMember.source = choosePreferredValue(targetMember.source, sourceMember.source, overrides.source);
        targetMember.externalRef = choosePreferredValue(targetMember.externalRef, sourceMember.externalRef);
        targetMember.preferredContactMethod = choosePreferredValue(targetMember.preferredContactMethod, sourceMember.preferredContactMethod, overrides.preferredContactMethod);
        targetMember.notes = mergeNotes(targetMember.notes, sourceMember.notes, overrides.notes);
        targetMember.tags = mergedTags;
        targetMember.winePreferences = Object.keys(mergedWinePreferences).length > 0 ? mergedWinePreferences : null;
        targetMember.lifetimeSpend = Number(targetMember.lifetimeSpend || 0) + Number(sourceMember.lifetimeSpend || 0);
        targetMember.totalOrders = Number(targetMember.totalOrders || 0) + Number(sourceMember.totalOrders || 0);
        targetMember.visitCount = Number(targetMember.visitCount || 0) + Number(sourceMember.visitCount || 0);
        targetMember.lastContactAt = pickLatestDate(targetMember.lastContactAt, sourceMember.lastContactAt);
        targetMember.lastVisitAt = pickLatestDate(targetMember.lastVisitAt, sourceMember.lastVisitAt);
        targetMember.lastPurchaseAt = pickLatestDate(targetMember.lastPurchaseAt, sourceMember.lastPurchaseAt);
        targetMember.marketingOptIn = Boolean(targetMember.marketingOptIn || sourceMember.marketingOptIn);
        targetMember.isWineClubMember = Boolean(targetMember.isWineClubMember || sourceMember.isWineClubMember);
        targetMember.loyaltyTier = (LOYALTY_RANK[sourceMember.loyaltyTier] || 0) > (LOYALTY_RANK[targetMember.loyaltyTier] || 0)
            ? sourceMember.loyaltyTier
            : targetMember.loyaltyTier;

        await targetMember.save({ transaction });

        const [taskCount, messageCount, tokenCount] = await Promise.all([
            Task.count({ where: { memberId: sourceMemberId, wineryId }, transaction }),
            Message.count({ where: { memberId: sourceMemberId, wineryId }, transaction }),
            MemberActionToken.count({ where: { memberId: sourceMemberId, wineryId }, transaction })
        ]);

        await Promise.all([
            Task.update({ memberId: targetMemberId }, { where: { memberId: sourceMemberId, wineryId }, transaction }),
            Message.update({ memberId: targetMemberId }, { where: { memberId: sourceMemberId, wineryId }, transaction }),
            MemberActionToken.update({ memberId: targetMemberId }, { where: { memberId: sourceMemberId, wineryId }, transaction })
        ]);

        const mergeNote = `Merged customer ${sourceMember.firstName} ${sourceMember.lastName} (#${sourceMember.id}) into this record on ${new Date().toISOString()}.`;
        targetMember.notes = targetMember.notes ? `${targetMember.notes}\n\n${mergeNote}` : mergeNote;
        await targetMember.save({ transaction });

        await sourceMember.destroy({ transaction });
        await transaction.commit();

        res.json({
            success: true,
            member: targetMember,
            mergeSummary: {
                targetMemberId,
                sourceMemberId,
                reassignedTasks: taskCount,
                reassignedMessages: messageCount,
                reassignedTokens: tokenCount
            }
        });
    } catch (err) {
        if (!transaction.finished) await transaction.rollback();
        next(err);
    }
}

module.exports = {
    listMembers,
    getMember,
    searchMembers,
    createMember,
    updateMember,
    deleteMember,
    mergeMember
};
