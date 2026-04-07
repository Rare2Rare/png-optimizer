export interface ImageInfo {
  path: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  format: string;
}

export interface ResizeSettings {
  mode: "none" | "scale" | "custom";
  scale: number; // percentage, e.g. 50
  width: number;
  height: number;
}

export interface OptimizationSettings {
  mode: "lossless" | "lossy";
  quality: number; // 1-100, used in lossy mode
  outputDir: string;
  stripMetadata: boolean;
  skipIfLarger: boolean;
  trashOriginal: boolean;
  resize: ResizeSettings;
}

export interface OptimizationResult {
  inputPath: string;
  outputPath: string;
  originalSize: number;
  optimizedSize: number;
  width: number;
  height: number;
  skipped: boolean;
}

export interface PreviewResult {
  beforeDataUrl: string;
  afterDataUrl: string;
  originalSize: number;
  optimizedSize: number;
  width: number;
  height: number;
}

export interface BatchProgressPayload {
  inputPath: string;
  index: number;
  total: number;
  status: "done" | "skipped" | "error";
  result?: OptimizationResult;
  error?: string;
}

export type QueueItemStatus = "pending" | "processing" | "done" | "skipped" | "error";

export interface QueueItem {
  id: string;
  info: ImageInfo;
  status: QueueItemStatus;
  result?: OptimizationResult;
  error?: string;
  selected: boolean;
}
