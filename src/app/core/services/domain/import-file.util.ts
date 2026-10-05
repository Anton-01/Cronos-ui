import { HttpResponse } from '@angular/common/http';

/**
 * RFC 6266 `filename*=UTF-8''...` takes precedence over the plain
 * `filename="..."` fallback that some proxies still attach alongside it.
 */
const FILENAME_STAR_PATTERN = /filename\*=UTF-8''([^;]+)/i;
const FILENAME_PATTERN = /filename="?([^";]+)"?/i;

/** The file name from `Content-Disposition`, or `fallbackName` when the header is absent/unparsable. */
export function downloadedFileName(response: HttpResponse<unknown>, fallbackName: string): string {
  const disposition = response.headers.get('Content-Disposition');
  if (!disposition) {
    return fallbackName;
  }
  const starMatch = FILENAME_STAR_PATTERN.exec(disposition);
  if (starMatch) {
    try {
      return decodeURIComponent(starMatch[1]);
    } catch {
      return fallbackName;
    }
  }
  const match = FILENAME_PATTERN.exec(disposition);
  return match ? match[1] : fallbackName;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

/** `response.body` paired with its suggested file name, or throws if the body is empty. */
export function toDownloadedFile(response: HttpResponse<Blob>, fallbackName: string): DownloadedFile {
  const blob = response.body;
  if (!blob) {
    throw new Error('Empty template response body');
  }
  return { blob, fileName: downloadedFileName(response, fallbackName) };
}

/** Triggers a browser "Save As" for a blob without navigating the page away. */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
