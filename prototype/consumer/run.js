// PROTOTYPE — throwaway. Runs every resolver leg against one exports shape.
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');

const shape = process.argv[2];
execFileSync('node', ['shape.js', shape], { cwd: __dirname, stdio: 'inherit' });

const results = [];
const record = (leg, ok, detail) => results.push({ leg, ok, detail });

const nodeResolve = (spec) => {
  try {
    const out = execFileSync('node', ['-e', `require.resolve(${JSON.stringify(spec)})`], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, detail: 'resolved' };
  } catch (e) {
    const stderr = String(e.stderr || '');
    const code = (stderr.match(/code: '([A-Z_]+)'/) || [])[1] || 'unknown';
    return { ok: false, detail: code };
  }
};

let r = nodeResolve('@rocket.chat/sdk');
record('node root', r.ok, r.detail);
r = nodeResolve('@rocket.chat/sdk/lib/drivers/ddp');
record('node deep', r.ok, r.detail);

// tsc: attribute errors to the probe file, so the SDK's own internal errors do not
// count as a resolution failure.
const tsc = (probe) => {
  let out = '';
  try {
    out = String(execSync(`npx tsc -p tsconfig.probe-${probe}.json 2>&1`, { cwd: __dirname }));
  } catch (e) {
    out = String(e.stdout || '');
  }
  const own = out.split('\n').filter((l) => l.includes(`probe-${probe}.ts(`));
  const sdkInternal = out.split('\n').filter((l) => l.includes('node_modules/@rocket.chat/sdk')).length;
  return { own, sdkInternal };
};

let t = tsc('root');
record(
  'tsc root',
  t.own.length === 0,
  t.own.length ? t.own[0].replace(/^.*probe-root\.ts/, 'probe-root.ts') : `resolved (${t.sdkInternal} errors inside SDK source)`
);

t = tsc('any');
// probe-any errors => the import carries real types. No error => it resolved to `any`.
record('tsc types real (not any)', t.own.length > 0, t.own.length ? 'typed' : 'resolved to any / unresolved');

t = tsc('deep');
record(
  'tsc deep',
  t.own.length === 0,
  t.own.length ? t.own[0].replace(/^.*probe-deep\.ts/, 'probe-deep.ts') : 'resolved'
);

const metro = (entry) => {
  try {
    execSync(
      `npx metro build ${entry} --out out/${entry}.bundle --platform android --reset-cache 2>&1`,
      { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return { ok: true, detail: 'bundled' };
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    const line =
      (out.match(/PackagePathNotExported[^\n]*/) || [])[0] ||
      (out.match(/Unable to resolve[^\n]*/) || [])[0] ||
      (out.match(/error[^\n]*/i) || [])[0] ||
      'failed';
    return { ok: false, detail: line.slice(0, 160) };
  }
};

r = metro('entry.ts');
record('metro root', r.ok, r.detail);
r = metro('entry-deep.ts');
record('metro deep', r.ok, r.detail);

const jest = (file) => {
  try {
    execSync(`npx jest ${file} --no-cache 2>&1`, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, detail: 'passed' };
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    const line =
      (out.match(/Package subpath[^\n]*/) || [])[0] ||
      (out.match(/Cannot find module[^\n]*/) || [])[0] ||
      (out.match(/ERR_PACKAGE[^\n]*/) || [])[0] ||
      'failed';
    return { ok: false, detail: line.slice(0, 160) };
  }
};

r = jest('root.test.ts');
record('jest root', r.ok, r.detail);
r = jest('deep.test.ts');
record('jest deep', r.ok, r.detail);

console.log(`\n===== shape ${shape} =====`);
for (const { leg, ok, detail } of results) {
  console.log(`${(ok ? 'PASS' : 'FAIL').padEnd(5)} ${leg.padEnd(26)} ${detail}`);
}
fs.writeFileSync(`result-${shape}.json`, JSON.stringify(results, null, 2));
