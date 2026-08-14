// PROTOTYPE — throwaway. Rewrites the SDK's package.json to one of the candidate shapes.
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, 'node_modules/@rocket.chat/sdk/package.json');

const shapes = {
  // control: what mobile ships today
  '0-none': (pkg) => {
    delete pkg.exports;
    delete pkg.types;
  },
  '1-bare': (pkg) => {
    delete pkg.types;
    pkg.exports = { '.': './index.ts' };
  },
  '2-types': (pkg) => {
    pkg.types = 'index.ts';
    pkg.exports = { '.': { types: './index.ts', default: './index.ts' } };
  },
  '3-driver-subpath': (pkg) => {
    pkg.types = 'index.ts';
    pkg.exports = {
      '.': { types: './index.ts', default: './index.ts' },
      './lib/drivers/ddp': { types: './lib/drivers/ddp.ts', default: './lib/drivers/ddp.ts' },
    };
  },
};

const name = process.argv[2];
if (!shapes[name]) {
  console.error(`unknown shape ${name}; have: ${Object.keys(shapes).join(', ')}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
shapes[name](pkg);
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`shape ${name}: main=${pkg.main} types=${pkg.types} exports=${JSON.stringify(pkg.exports)}`);
