import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const SAFE_MIME_TYPES = {
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export class ArtifactManager {
  constructor(baseDir) {
    this.baseDir = baseDir || path.join(process.cwd(), 'artifacts');
    this.maxArtifactBytes = 10 * 1024 * 1024; // 10 MiB per artifact
    this.defaultRetentionDays = 7;
    this.maxTotalStorageBytes = 50 * 1024 * 1024; // 50 MiB total quota
  }

  ensureDir() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Sanitizes a requested filename to prevent path traversal (#321)
   */
  sanitizeFilename(name) {
    if (!name || typeof name !== 'string') return 'artifact.txt';
    const clean = path.basename(name).replace(/[\0\r\n\\\/]/g, '_');
    return clean || 'artifact.txt';
  }

  getFilePath(artifactId, filename) {
    if (!filename || filename.includes('..') || path.isAbsolute(filename)) {
      throw new Error('Path traversal attempt detected in artifact storage');
    }
    const safeName = this.sanitizeFilename(filename);
    const target = path.resolve(this.baseDir, `${artifactId}_${safeName}`);
    // Security check: ensure path stays strictly within baseDir
    if (!target.startsWith(path.resolve(this.baseDir) + path.sep)) {
      throw new Error('Path traversal attempt detected in artifact storage');
    }
    return target;
  }

  /**
   * Resolves safe MIME type for download/preview
   */
  resolveMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    // Neutralize dangerous web formats to prevent XSS / script execution
    if (ext === '.html' || ext === '.htm' || ext === '.svg' || ext === '.js') {
      return 'text/plain; charset=utf-8';
    }
    return SAFE_MIME_TYPES[ext] || 'application/octet-stream';
  }

  /**
   * Saves a new artifact file bound to a run (#321)
   */
  saveArtifact(runId, taskId, filename, contentBuffer) {
    this.ensureDir();
    const buf = Buffer.isBuffer(contentBuffer) ? contentBuffer : Buffer.from(contentBuffer || '', 'utf8');

    if (buf.length > this.maxArtifactBytes) {
      throw new Error(`Artifact size (${buf.length} bytes) exceeds limit of ${this.maxArtifactBytes} bytes`);
    }

    const artifactId = 'art_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const safeName = this.sanitizeFilename(filename);
    const filePath = this.getFilePath(artifactId, safeName);

    fs.writeFileSync(filePath, buf);

    const sha256 = createHash('sha256').update(buf).digest('hex');
    const mimeType = this.resolveMimeType(safeName);

    return {
      id: artifactId,
      name: safeName,
      sizeBytes: buf.length,
      mimeType,
      sha256,
      runId,
      taskId,
      createdAt: Date.now(),
      status: 'available',
    };
  }

  /**
   * Reads an artifact file buffer
   */
  readArtifact(artifactId, filename) {
    const filePath = this.getFilePath(artifactId, filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath);
  }

  /**
   * Generates a safe preview of the artifact content (first 64 KiB)
   */
  generatePreview(artifactId, filename) {
    const buf = this.readArtifact(artifactId, filename);
    if (!buf) return { ok: false, error: 'Artifact file not found on disk' };

    const ext = path.extname(filename).toLowerCase();
    const isText = ['.txt', '.csv', '.json', '.log', '.md'].includes(ext);

    if (isText) {
      const slice = buf.subarray(0, 64 * 1024);
      return {
        ok: true,
        kind: 'text',
        mimeType: this.resolveMimeType(filename),
        content: slice.toString('utf8'),
        truncated: buf.length > slice.length,
        sizeBytes: buf.length,
      };
    }

    return {
      ok: true,
      kind: 'binary',
      mimeType: this.resolveMimeType(filename),
      sizeBytes: buf.length,
      preview: `[Binary file: ${filename} (${buf.length} bytes)]`,
    };
  }

  /**
   * Cleans up expired artifacts and enforces size quotas (#321)
   */
  cleanupArtifacts(store, { retentionDays = this.defaultRetentionDays, maxTotalBytes = this.maxTotalStorageBytes } = {}) {
    if (!fs.existsSync(this.baseDir)) return { removedCount: 0, freedBytes: 0 };

    const cutoff = Date.now() - retentionDays * 86400000;
    let files = fs.readdirSync(this.baseDir);
    let totalBytes = 0;
    const fileStats = [];

    for (const f of files) {
      const p = path.join(this.baseDir, f);
      try {
        const stat = fs.statSync(p);
        totalBytes += stat.size;
        fileStats.push({ path: p, filename: f, mtime: stat.mtimeMs, size: stat.size });
      } catch (e) {
        // file unlinked concurrently
      }
    }

    let removedCount = 0;
    let freedBytes = 0;

    // 1. Remove files older than retentionDays
    for (const item of fileStats) {
      if (item.mtime < cutoff) {
        try {
          fs.unlinkSync(item.path);
          removedCount++;
          freedBytes += item.size;
          totalBytes -= item.size;
        } catch (e) {
          void e;
        }
      }
    }

    // 2. Enforce quota: remove oldest files if totalBytes > maxTotalBytes
    if (totalBytes > maxTotalBytes) {
      fileStats.sort((a, b) => a.mtime - b.mtime);
      for (const item of fileStats) {
        if (totalBytes <= maxTotalBytes) break;
        if (fs.existsSync(item.path)) {
          try {
            fs.unlinkSync(item.path);
            removedCount++;
            freedBytes += item.size;
            totalBytes -= item.size;
          } catch (e) {
          void e;
        }
        }
      }
    }

    return { removedCount, freedBytes };
  }
}
