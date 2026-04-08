import { invoke } from "@tauri-apps/api/core";
import type {
  ImageInfo,
  OptimizationResult,
  PreviewResult,
  ResizeSettings,
} from "./types";

function resizeArgs(r: ResizeSettings) {
  return {
    resizeScale: r.mode === "scale" ? r.scale : 0,
    resizeWidth: r.mode === "custom" ? r.width : 0,
    resizeHeight: r.mode === "custom" ? r.height : 0,
  };
}

export async function resolvePaths(
  paths: string[],
  recursive: boolean,
): Promise<string[]> {
  return invoke<string[]>("resolve_paths", { paths, recursive });
}

export async function loadImageInfo(path: string): Promise<ImageInfo> {
  return invoke<ImageInfo>("load_image_info", { path });
}

export async function generatePreview(
  path: string,
  mode: "lossless" | "lossy",
  quality: number,
  stripMetadata: boolean,
  resize: ResizeSettings,
): Promise<PreviewResult> {
  return invoke<PreviewResult>("generate_preview", {
    path,
    mode,
    quality,
    stripMetadata,
    ...resizeArgs(resize),
  });
}

export async function optimizeSingle(
  inputPath: string,
  outputDir: string,
  mode: "lossless" | "lossy",
  quality: number,
  stripMetadata: boolean,
  skipIfLarger: boolean,
  trashOriginal: boolean,
  outputFormat: string,
  outputTemplate: string,
  resize: ResizeSettings,
): Promise<OptimizationResult> {
  return invoke<OptimizationResult>("optimize_single", {
    inputPath,
    outputDir,
    mode,
    quality,
    stripMetadata,
    skipIfLarger,
    trashOriginal,
    outputFormat,
    outputTemplate,
    ...resizeArgs(resize),
  });
}

export async function optimizeBatch(
  inputPaths: string[],
  outputDir: string,
  mode: "lossless" | "lossy",
  quality: number,
  stripMetadata: boolean,
  skipIfLarger: boolean,
  trashOriginal: boolean,
  outputFormat: string,
  outputTemplate: string,
  resize: ResizeSettings,
): Promise<void> {
  return invoke<void>("optimize_batch", {
    inputPaths,
    outputDir,
    mode,
    quality,
    stripMetadata,
    skipIfLarger,
    trashOriginal,
    outputFormat,
    outputTemplate,
    ...resizeArgs(resize),
  });
}

export async function startWatch(
  watchDir: string,
  outputDir: string,
  mode: string,
  quality: number,
  stripMetadata: boolean,
  skipIfLarger: boolean,
  outputFormat: string,
  outputTemplate: string,
): Promise<void> {
  return invoke<void>("start_watch", {
    watchDir,
    outputDir,
    mode,
    quality,
    stripMetadata,
    skipIfLarger,
    outputFormat,
    outputTemplate,
  });
}

export async function stopWatch(): Promise<void> {
  return invoke<void>("stop_watch");
}
