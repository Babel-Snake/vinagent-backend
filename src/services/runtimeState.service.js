let draining = false;

function markDraining() {
  draining = true;
}

function isDraining() {
  return draining;
}

function resetForTests() {
  if (process.env.NODE_ENV === 'test') draining = false;
}

module.exports = {
  isDraining,
  markDraining,
  resetForTests
};
