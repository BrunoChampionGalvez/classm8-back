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
  if (stat.size <= maxBytes) return null; // no chunking needed
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

    const bytesPerSecond = stat.size / durationSeconds;
    const targetSecondsRaw = Math.floor(maxBytes / bytesPerSecond);
    const segmentSeconds = Math.max(60, targetSecondsRaw); // at least 60s

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
