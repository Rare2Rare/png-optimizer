export const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".bmp", ".webp"];

export const DEFAULT_QUALITY = 75;

export const PREVIEW_MAX_SIZE = 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatReduction(original: number, optimized: number): string {
  if (original === 0) return "0%";
  const reduction = ((original - optimized) / original) * 100;
  return `${reduction >= 0 ? "-" : "+"}${Math.abs(reduction).toFixed(1)}%`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
