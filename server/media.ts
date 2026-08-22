import fs from 'fs';
import path from 'path';
import type { ScheduledMedia, ScheduledMessage } from '../src/types';



export class MediaService {
  private mediaDir: string;

  constructor(mediaDir: string) {
    this.mediaDir = mediaDir;
    try {
      if (!fs.existsSync(this.mediaDir)) {
        fs.mkdirSync(this.mediaDir, { recursive: true });
      }
    } catch (err) {
      console.error('[Media] Failed to create media directory:', err);
    }
  }
  public getMediaDir(): string {
    return this.mediaDir;
  }

  public getFilePath(fileName: string): string {
    return path.join(this.mediaDir, fileName);
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


