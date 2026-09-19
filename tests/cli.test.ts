import assert from "node:assert/strict";
import { execFile, type ExecFileException } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("CLI reads a dictation from stdin before requiring an API key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "codes-cli-"));
  const catalog = join(directory, "catalog.json");
  await writeFile(
    catalog,
    JSON.stringify([
      {
        code: "64721",
        system: "CPT",
        description: "Open carpal tunnel release",
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
        ["src/cli.ts", "--codes", catalog],
        { env: { ...process.env, TYPESAFE_API_KEY: "" } },
        (error, _stdout, stderr) => resolve({ error, stderr }),
      );
      child.stdin?.end("Open carpal tunnel release was completed.");
    });

    assert.ok(result.error);
    assert.match(
      result.stderr,
      /TYPESAFE_API_KEY is required/,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});
