const { Winery } = require('../src/models');
async function check() {
    const w = await Winery.findOne({ where: { contactPhone: '+15550100' } });
    console.log('Simulator Winery ID:', w ? w.id : 'NOT FOUND');
}
check();
