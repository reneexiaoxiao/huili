/** Storage URLs identify the permanent object; viewing needs a fresh signed URL. */
export function dailyBlankAssetFileName(imageUrl: string): string | undefined {
  try {
    const path = decodeURIComponent(new URL(imageUrl, 'https://huili.invalid').pathname);
    return path.match(
      /^\/spark\/app\/[a-zA-Z0-9_-]+\/runtime\/api\/v1\/storage\/object\/[^/]+\/daily-blank\/[a-f0-9]{16}\/([a-f0-9]{32}\.(?:png|jpg|jpeg|webp))$/,
    )?.[1];
  } catch {
    return undefined;
  }
}
