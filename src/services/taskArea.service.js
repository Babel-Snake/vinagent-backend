const { OperationalArea, TaskArea } = require('../models');

function getTaskAreaInclude() {
  return {
    model: OperationalArea,
    as: 'OperationalAreas',
    attributes: ['id', 'name', 'description', 'isActive', 'sortOrder'],
    through: { attributes: ['relationshipType'] },
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
