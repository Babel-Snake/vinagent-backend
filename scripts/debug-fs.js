
const fs = require('fs');
try {

    fs.writeFileSync('./scripts/debug_fs_out.txt', 'FS Write Worked');

} catch (err) {
    // console.log would be invisible
}
