const { Member } = require('../models');
const { appendMemberNote } = require('./taskWorkflowPolicy.service');

async function enrichMemberFromTaskOutcome(task, transaction) {
  const manualIntake = task.payload?.manualIntake;
  if (!task.memberId || manualIntake?.taskOrigin !== 'EXTERNAL') {
    return null;
  }

  const member = await Member.findOne({
    where: {
      id: task.memberId,
      wineryId: task.wineryId
    },
    transaction
  });

  if (!member) {
    return null;
  }

  const originalTags = Array.isArray(member.tags) ? member.tags : [];
  const tagSet = new Set(originalTags);
  const now = new Date();
  let noteLine = null;

  if (task.category === 'BOOKING') {
    tagSet.add('booking_contact');
    if (task.subType === 'BOOKING_NEW') {
      tagSet.add('booking_customer');
    }
    if (member.source === 'manual') {
      member.source = 'booking';
    }
    noteLine = `Task ${task.id} actioned from external booking intake.`;
  } else if (task.category === 'ORDER') {
    tagSet.add('order_contact');
    tagSet.add('order_customer');
    noteLine = `Task ${task.id} actioned from external order intake.`;
  } else if (task.category === 'ACCOUNT') {
    tagSet.add('identified_contact');
    noteLine = `Task ${task.id} actioned from external account intake.`;
  } else if (task.category === 'GENERAL') {
    tagSet.add('inbound_contact');
    noteLine = `Task ${task.id} actioned from external enquiry intake.`;
  }

  const nextTags = Array.from(tagSet);
  const tagsChanged = JSON.stringify(originalTags) !== JSON.stringify(nextTags);
  const nextNotes = appendMemberNote(member.notes, noteLine);
  const notesChanged = nextNotes !== member.notes;

  member.tags = nextTags;
  member.notes = nextNotes;
  member.lastContactAt = now;
  await member.save({ transaction });

  return {
    memberId: member.id,
    tagsAdded: nextTags.filter(tag => !originalTags.includes(tag)),
    noteAdded: notesChanged,
    tagsChanged
  };
}

module.exports = {
  enrichMemberFromTaskOutcome
};
