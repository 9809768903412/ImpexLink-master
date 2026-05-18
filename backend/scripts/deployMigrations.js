const { spawnSync } = require('child_process');
const path = require('path');

const failedMigrationName = '20260519104500_prevent_duplicate_inventory_names';
const prismaCli = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');

function runPrisma(args, options = {}) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  });

  return {
    ...result,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n'),
  };
}

function printOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function exitWith(result) {
  if (result.error) {
    console.error(result.error);
  }
  printOutput(result);
  process.exit(result.status || 1);
}

const deploy = runPrisma(['migrate', 'deploy']);
printOutput(deploy);

if (deploy.status === 0) {
  process.exit(0);
}

const canResolveFailedMigration =
  deploy.output.includes('P3009') &&
  deploy.output.includes('failed migrations') &&
  deploy.output.includes(failedMigrationName);

if (!canResolveFailedMigration) {
  exitWith(deploy);
}

console.log(`Resolving failed Prisma migration: ${failedMigrationName}`);
const resolve = runPrisma(['migrate', 'resolve', '--rolled-back', failedMigrationName], { stdio: 'inherit' });
if (resolve.status !== 0) {
  exitWith(resolve);
}

const retryDeploy = runPrisma(['migrate', 'deploy'], { stdio: 'inherit' });
if (retryDeploy.status !== 0) {
  exitWith(retryDeploy);
}
