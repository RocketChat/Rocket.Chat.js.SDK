const fs = require('fs');

const package = JSON.parse(fs.readFileSync('package.json'));

package.main = 'index.js';
package.types = 'index.d.ts';
package.private = false;

fs.writeFileSync('./dist/package.json', JSON.stringify(package, null, 2));
