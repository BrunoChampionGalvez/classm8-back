import { promises as fs } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
// Attempt to load static binaries (optional dependency pattern)
let ffmpegBin: string | undefined;
let ffprobeBin: string | undefined;
try { // eslint-disable-next-line @typescript-eslint/no-var-requires
  ffmpegBin = require('ffmpeg-static');
} catch {}
try { // eslint-disable-next-line @typescript-eslint/no-var-requires
  ffprobeBin = require('ffprobe-static')?.path;
} catch {}

export interface ChunkResult {
  chunkPaths: string[];
  segmentSeconds: number;
}

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export async function chunkAudioIfNeeded(inputPath: string, maxBytes = 25 * 1024 * 1024): Promise<ChunkResult | null> {
  const stat = await fs.stat(inputPath);
  // Allow override via env variable (in megabytes)
  const targetMbEnv = process.env.CHUNK_TARGET_MB ? parseFloat(process.env.CHUNK_TARGET_MB) : undefined;
  if (targetMbEnv && isFinite(targetMbEnv) && targetMbEnv > 0) {
    maxBytes = targetMbEnv * 1024 * 1024;
  }
  const maxChunkSecondsEnv = process.env.MAX_CHUNK_SECONDS ? parseInt(process.env.MAX_CHUNK_SECONDS, 10) : undefined; // hard ceiling (e.g. 1400)
  const hardMaxSeconds = (isFinite(maxChunkSecondsEnv as number) && (maxChunkSecondsEnv as number) > 0) ? (maxChunkSecondsEnv as number) : 1400;
  if (stat.size <= maxBytes) {
    // Even if size small, still ensure duration under hard limit; if too long, we must segment by time only.
    // We'll only segment if duration > hardMaxSeconds.
  }
  try {
    // Use ffprobe to get duration
  const probeCmd = ffprobeBin || 'ffprobe';
  const probe = await run(probeCmd, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ]);
    if (probe.code !== 0) {
      // ffprobe present but failed
      throw new Error('ffprobe failed: ' + probe.stderr);
    }
    const durationSeconds = parseFloat(probe.stdout.trim()) || 0;
    if (!durationSeconds || !isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('Could not determine audio duration for chunking');
    }

    const needsSizeChunking = stat.size > maxBytes;
    const needsTimeChunking = durationSeconds > hardMaxSeconds;
    if (!needsSizeChunking && !needsTimeChunking) {
      return null; // no chunking necessary
    }

    const bytesPerSecond = stat.size / Math.max(durationSeconds, 1);
    let targetSecondsRaw = Math.floor(maxBytes / bytesPerSecond);
    if (!isFinite(targetSecondsRaw) || targetSecondsRaw <= 0) targetSecondsRaw = 300; // fallback ~5 min

    // Choose smallest between targetSecondsRaw and hardMaxSeconds to satisfy both constraints
    let segmentSeconds = Math.min(targetSecondsRaw, hardMaxSeconds);
    // Avoid generating huge segments inadvertently
    segmentSeconds = Math.max(60, Math.min(segmentSeconds, hardMaxSeconds));
    // If durationSeconds still less than segmentSeconds (e.g., only time chunking), clamp
    if (durationSeconds < segmentSeconds) segmentSeconds = Math.floor(durationSeconds);
    // Guarantee segmentSeconds < hardMaxSeconds to avoid boundary equal exceeding due to rounding by ffmpeg
    if (segmentSeconds >= hardMaxSeconds) segmentSeconds = hardMaxSeconds - 1;

    const dir = path.dirname(inputPath);
    const base = path.basename(inputPath, path.extname(inputPath));
    const pattern = path.join(dir, `${base}-segment-%03d${path.extname(inputPath)}`);

  const ffmpegCmd = ffmpegBin || 'ffmpeg';
  const ff = await run(ffmpegCmd, [
      '-y',
      '-i', inputPath,
      '-c', 'copy',
      '-f', 'segment',
      '-reset_timestamps', '1',
      '-segment_time', segmentSeconds.toString(),
      pattern,
    ]);
    if (ff.code !== 0) {
      throw new Error('ffmpeg segmentation failed: ' + ff.stderr);
    }

    const dirEntries = await fs.readdir(dir);
    const chunkPaths = dirEntries
      .filter((f) => f.startsWith(base + '-segment-'))
      .map((f) => path.join(dir, f))
      .sort();

    if (!chunkPaths.length) {
      throw new Error('No chunks produced by ffmpeg');
    }
    return { chunkPaths, segmentSeconds };
  } catch (err: any) {
    if (err?.code === 'ENOENT' || /ffprobe|ffmpeg/i.test(String(err?.message))) {
      // Provide a clearer message upstream
      throw new Error('Missing ffmpeg/ffprobe binaries. Please install ffmpeg and ensure ffmpeg & ffprobe are in PATH. Original: ' + err.message);
    }
    throw err;
  }
}
