import fs from 'fs';
import path from 'path';
import type { ScheduledMedia, ScheduledMessage } from '../src/types';

export class MediaService {
  private mediaDir: string;

  constructor(mediaDir: string) {
    this.mediaDir = path.resolve(mediaDir);
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
    const safeName = path.basename(fileName);
    return path.join(this.mediaDir, safeName);
  }

  public fileExists(localPath: string): boolean {
    const candidate = path.resolve(localPath);
    const root = this.mediaDir + path.sep;
    if (!candidate.startsWith(root)) {
      return false;
    }
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }

  public deleteMediaIfUnreferenced(localPath: string, allSchedules: ScheduledMessage[]): boolean {
    if (!localPath) return false;
    const candidate = path.resolve(localPath);
    const root = this.mediaDir + path.sep;
    if (!candidate.startsWith(root)) {
      console.warn(`[Media] Attempted to delete external file: ${localPath}`);
      return false;
    }

    try {
      const isReferenced = allSchedules.some((s) => s.media?.localPath === localPath);
      if (!isReferenced && fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
        console.log(`[Media] Cleaned up unreferenced file: ${localPath}`);
        return true;
      }
    } catch (err) {
      console.warn(`[Media] Failed to delete media file ${localPath}:`, err);
    }
    return false;
  }
}
