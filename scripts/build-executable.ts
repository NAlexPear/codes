import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { inject } from 'postject';

const DIST_DIRECTORY = 'dist';
const BUNDLE_PATH = `${DIST_DIRECTORY}/codes.cjs`;
const BLOB_PATH = `${DIST_DIRECTORY}/codes.blob`;
const CONFIG_PATH = `${DIST_DIRECTORY}/sea-config.json`;
const EXECUTABLE_PATH = `${DIST_DIRECTORY}/codes`;
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const JSON_INDENT = 2;
const EXECUTABLE_MODE = 0o755;
const SUCCESS_EXIT_CODE = 0;
const SUPPORTED_PLATFORMS: readonly NodeJS.Platform[] = ['darwin', 'linux'];

if (!SUPPORTED_PLATFORMS.includes(process.platform)) {
  throw new Error(`Unsupported operating system: ${process.platform}.`);
}

const run = async (command: string, args: string[]): Promise<void> => {
  const child = spawn(command, args, { stdio: 'inherit' });
  await once(child, 'exit');
  if (child.exitCode !== SUCCESS_EXIT_CODE) {
    throw new Error(`${command} exited with status ${String(child.exitCode)}.`);
  }
};

await rm(DIST_DIRECTORY, { force: true, recursive: true });
await mkdir(DIST_DIRECTORY, { recursive: true });

await build({
  bundle: true,
  entryPoints: ['src/cli.ts'],
  format: 'cjs',
  logLevel: 'info',
  outfile: BUNDLE_PATH,
  platform: 'node',
  target: 'node24',
});

await writeFile(
  CONFIG_PATH,
  `${JSON.stringify(
    {
      disableExperimentalSEAWarning: true,
      execArgvExtension: 'none',
      main: BUNDLE_PATH,
      output: BLOB_PATH,
      useCodeCache: false,
      useSnapshot: false,
    },
    undefined,
    JSON_INDENT,
  )}\n`,
);

await run(process.execPath, ['--experimental-sea-config', CONFIG_PATH]);
await copyFile(process.execPath, EXECUTABLE_PATH);

if (process.platform === 'darwin') {
  await run('codesign', ['--remove-signature', EXECUTABLE_PATH]);
}

const options: { machoSegmentName?: string; sentinelFuse: string } = {
  sentinelFuse: SENTINEL_FUSE,
};
if (process.platform === 'darwin') {
  options.machoSegmentName = 'NODE_SEA';
}
await inject(
  EXECUTABLE_PATH,
  'NODE_SEA_BLOB',
  await readFile(BLOB_PATH),
  options,
);

if (process.platform === 'darwin') {
  await run('codesign', ['--sign', '-', EXECUTABLE_PATH]);
}
await chmod(EXECUTABLE_PATH, EXECUTABLE_MODE);

process.stdout.write(`Built ${EXECUTABLE_PATH}\n`);
