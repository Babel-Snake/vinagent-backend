const { User } = require('../models');

async function listUsers(req, res, next) {
    try {
        const { wineryId } = req.user;
        const users = await User.findAll({
            where: { wineryId },
            attributes: ['id', 'displayName', 'role', 'email']
        });
        res.json({ users });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listUsers
};
