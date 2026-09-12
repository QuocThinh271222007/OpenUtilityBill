// SPDX-License-Identifier: MIT

import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const backendDirectory = resolve(scriptDirectory, "..");
const sourceDirectory = resolve(backendDirectory, "src");

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(absolutePath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(absolutePath);
    }
  }

  return files;
}

const testFiles = (await collectTestFiles(sourceDirectory)).sort((a, b) => a.localeCompare(b));

if (testFiles.length === 0) {
  console.error("Không tìm thấy file *.test.ts nào trong backend/src.");
  process.exit(1);
}

console.log(`Đã phát hiện ${testFiles.length} file test.`);

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles.map((file) => relative(backendDirectory, file))],
  {
    cwd: backendDirectory,
    env: process.env,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error("Không thể khởi chạy test runner:", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Test runner kết thúc bởi signal ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
