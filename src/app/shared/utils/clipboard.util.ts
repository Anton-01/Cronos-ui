/** Writes `text` to the clipboard; `false` on a denied/insecure-context failure instead of throwing. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
