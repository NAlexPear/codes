import type { ExecFileException } from 'node:child_process';

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

await test('CLI reads a dictation from stdin before requiring an API key', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codes-cli-')),
    catalog = path.join(directory, 'catalog.json');
  await writeFile(
    catalog,
    JSON.stringify([
      {
        code: '64721',
        description: 'Open carpal tunnel release',
        system: 'CPT',
      },
    ]),
  );

  try {
    const result = await new Promise<{
      error: ExecFileException | null;
      stderr: string;
    }>((resolve) => {
      const child = execFile(
        process.execPath,
        ['src/cli.ts', '--codes', catalog],
        { env: { TYPESAFE_API_KEY: '' } },
        (error, _stdout, stderr) => {
          resolve({ error, stderr });
        },
      );
      assert.ok(child.stdin);
      child.stdin.end('Open carpal tunnel release was completed.');
    });

    assert.ok(result.error);
    assert.match(result.stderr, /TYPESAFE_API_KEY is required/u);
  } finally {
    await rm(directory, { recursive: true });
  }
});
