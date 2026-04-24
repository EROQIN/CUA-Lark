import { readFile } from "node:fs/promises";
import path from "node:path";

const mimeByExtension: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

export async function imageToBase64DataUrl(imagePath: string): Promise<string> {
  const extension = path.extname(imagePath).toLowerCase();
  const mimeType = mimeByExtension[extension];
  if (!mimeType) {
    throw new Error(`Unsupported image type: ${extension || "(none)"}. Supported: .png, .jpg, .jpeg`);
  }

  const image = await readFile(imagePath);
  return `data:${mimeType};base64,${image.toString("base64")}`;
}
