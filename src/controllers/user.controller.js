const { OperationalArea, User, UserAreaMembership } = require('../models');

async function listUsers(req, res, next) {
    try {
        const { wineryId } = req.user;
        const users = await User.findAll({
            where: { wineryId },
            attributes: ['id', 'displayName', 'role', 'email', 'isActive'],
            include: [{
                model: UserAreaMembership,
                as: 'AreaMemberships',
                where: { wineryId },
                attributes: ['areaId', 'membershipRole'],
                include: [{
                    model: OperationalArea,
                    as: 'Area',
                    where: { wineryId },
                    attributes: [],
                    required: true
                }],
                required: false
            }]
        });
        res.json({
            users: users.map(user => {
                const value = user.toJSON();
                return {
                    id: value.id,
                    displayName: value.displayName,
                    role: value.role,
                    email: value.email,
                    isActive: value.isActive,
                    areaIds: (value.AreaMemberships || [])
                        .map(membership => Number(membership.areaId)),
                    managedAreaIds: (value.AreaMemberships || [])
                        .filter(membership => membership.membershipRole === 'MANAGER')
                        .map(membership => Number(membership.areaId))
                };
            })
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listUsers
};
