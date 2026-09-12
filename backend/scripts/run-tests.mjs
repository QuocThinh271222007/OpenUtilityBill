// SPDX-License-Identifier: MIT

/**
 * Trách nhiệm:
 * Thay thế glob `"src/**\/*.test.ts"` trong `npm test` — glob đó chỉ
 * được shell (bash/zsh) tự mở rộng thành danh sách file trước khi gọi
 * `node`; trên GitHub Actions Ubuntu, `npm test` chạy qua `sh -c`, và
 * chuỗi glob có dấu ngoặc kép trong `package.json` được truyền NGUYÊN
 * VĂN cho Node — Node không tự mở rộng glob, nên báo lỗi không tìm
 * thấy file theo đúng nghĩa đen `src/**\/*.test.ts`. Script này tự đi
 * bộ (walk) thư mục và tìm file `*.test.ts`, thay cho việc dựa vào
 * shell glob expansion — hoạt động giống hệt trên Windows
 * PowerShell/npm lẫn GitHub Actions Ubuntu.
 *
 * Không chịu trách nhiệm:
 * - thêm dependency ngoài (không glob/fast-glob/Jest/Vitest) — chỉ
 *   dùng `fs`/`path`/`child_process`/`url` có sẵn của Node.
 * - thay đổi ngữ nghĩa test — vẫn gọi đúng `tsx --test` với TOÀN BỘ
 *   file `*.test.ts` tìm thấy, không bớt/thêm file nào so với glob cũ.
 */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const srcRoot = join(backendRoot, "src");

function findTestFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

const testFiles = findTestFiles(srcRoot).sort();

if (testFiles.length === 0) {
  console.error(`Không tìm thấy file *.test.ts nào dưới ${srcRoot}.`);
  process.exit(1);
}

console.log(`Tìm thấy ${testFiles.length} file test.`);

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles.map((f) => relative(backendRoot, f))],
  { cwd: backendRoot, stdio: "inherit", env: process.env }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
