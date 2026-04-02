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
  resize: ResizeSettings;
}

export interface OptimizationResult {
  inputPath: string;
  outputPath: string;
  originalSize: number;
  optimizedSize: number;
  width: number;
  height: number;
}

export interface PreviewResult {
  beforeDataUrl: string;
  afterDataUrl: string;
  originalSize: number;
  optimizedSize: number;
  width: number;
  height: number;
}

export type QueueItemStatus = "pending" | "processing" | "done" | "error";

export interface QueueItem {
  id: string;
  info: ImageInfo;
  status: QueueItemStatus;
  result?: OptimizationResult;
  error?: string;
  selected: boolean;
}
