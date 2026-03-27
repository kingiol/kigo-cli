import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type PackageMetadata = {
  version: string;
};

export function getProgramMetadata(): PackageMetadata {
  const filename = fileURLToPath(import.meta.url);
  const currentDir = dirname(filename);
  return JSON.parse(
    readFileSync(join(currentDir, "../../package.json"), "utf8"),
  ) as PackageMetadata;
}
