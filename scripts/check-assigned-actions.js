const { TaskAction, User, sequelize } = require('../src/models');

async function check() {
    const count = await TaskAction.count();
    console.log('Total TaskActions in DB:', count);

    const assigned = await TaskAction.findAll({
        where: { actionType: 'ASSIGNED' },
        include: [{ model: User, attributes: ['id', 'displayName'] }],
        order: [['createdAt', 'DESC']],
        limit: 5
    });

    console.log('ASSIGNED actions:', assigned.length);

    for (const a of assigned) {
        console.log('---');
        console.log('ID:', a.id, '| userId:', a.userId, '| User:', a.User?.displayName || 'NULL');
        console.log('Details:', JSON.stringify(a.details, null, 2));
    }

    await sequelize.close();
}

check().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
