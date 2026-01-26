const { Member } = require('../models');
const { Op } = require('sequelize');

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

module.exports = {
    searchMembers
};
