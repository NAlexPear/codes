import type { ExecFileException } from 'node:child_process';

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';

await test('CLI reads a dictation from stdin before requiring an API key', async () => {
  const result = await new Promise<{
    error: ExecFileException | null;
    stderr: string;
  }>((resolve) => {
    const child = execFile(
      process.execPath,
      ['src/cli.ts'],
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
});

await test('CLI help keeps the internal catalog out of the public interface', async () => {
  const result = await new Promise<{
    error: ExecFileException | null;
    stdout: string;
  }>((resolve) => {
    execFile(process.execPath, ['src/cli.ts', '--help'], (error, stdout) => {
      resolve({ error, stdout });
    });
  });

  assert.ifError(result.error);
  assert.match(result.stdout, /^Usage: codes \[--input/u);
  assert.doesNotMatch(result.stdout, /--codes/u);
});
