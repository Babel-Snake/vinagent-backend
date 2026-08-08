const { OperationalArea, TaskArea } = require('../models');

function getTaskAreaInclude(wineryId) {
  return {
    model: OperationalArea,
    as: 'OperationalAreas',
    where: { wineryId },
    attributes: ['id', 'name', 'description', 'isActive', 'sortOrder'],
    through: { attributes: ['relationshipType'], where: { wineryId } },
    required: false
  };
}

async function replaceTaskAreas({ taskId, wineryId, placement, transaction }) {
  await TaskArea.destroy({ where: { taskId, wineryId }, transaction });
  if (placement.areaScope !== 'AREAS') return;

  await TaskArea.bulkCreate(placement.areaIds.map(areaId => ({
    taskId,
    areaId,
    wineryId,
    relationshipType: Number(areaId) === Number(placement.primaryAreaId) ? 'PRIMARY' : 'LINKED'
  })), { transaction });
}

module.exports = {
  getTaskAreaInclude,
  replaceTaskAreas
};
