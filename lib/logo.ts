import fs from "node:fs";
import path from "node:path";

export const LOGO_FILE_NAME = "paperback-riders-logo.png";

export function logoFileExists(
  publicDirectory = path.join(process.cwd(), "public"),
): boolean {
  return fs.existsSync(path.join(publicDirectory, LOGO_FILE_NAME));
}
