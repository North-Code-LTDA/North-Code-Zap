import fs from 'fs';
import path from 'path';
import type { ScheduledMedia, ScheduledMessage } from '../src/types';

export const MEDIA_DATA_DIR =
  process.env.MEDIA_DATA_DIR || path.join(process.cwd(), 'data', 'media');

// Ensure media directory exists
try {
  if (!fs.existsSync(MEDIA_DATA_DIR)) {
    fs.mkdirSync(MEDIA_DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.error('[Media] Failed to create media directory:', err);
}

export class MediaService {
  public getMediaDir(): string {
    return MEDIA_DATA_DIR;
  }

  public getFilePath(fileName: string): string {
    return path.join(MEDIA_DATA_DIR, fileName);
  }

  public fileExists(localPath: string): boolean {
    try {
      return fs.existsSync(localPath);
    } catch {
      return false;
    }
  }

  public deleteMediaIfUnreferenced(localPath: string, allSchedules: ScheduledMessage[]): boolean {
    if (!localPath) return false;
    try {
      // Check if any other schedule references this exact localPath
      const isReferenced = allSchedules.some(
        (s) => s.media?.localPath === localPath
      );

      if (!isReferenced && fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        console.log(`[Media] Cleaned up unreferenced file: ${localPath}`);
        return true;
      }
    } catch (err) {
      console.warn(`[Media] Failed to delete media file ${localPath}:`, err);
    }
    return false;
  }
}

export const mediaService = new MediaService();
