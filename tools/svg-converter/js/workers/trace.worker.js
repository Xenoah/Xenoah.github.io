/* CPU負荷の高いトレースをUIスレッドから分離するWorker。
 * メッセージ契約:
 *   in:  { id, type: 'trace', mode, imageData, params }
 *   out: { id, type: 'progress', value }
 *   out: { id, type: 'done', svg }
 *   out: { id, type: 'error', message }
 *   in:  { id, type: 'cancel' }
 */

import { traceImageData } from '../engine/trace.js';

const cancelled = new Set();

self.addEventListener('message', async (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'cancel') {
    // アルゴリズム内部の区切りでisCancelledを確認し、途中結果を返さず終了する。
    cancelled.add(msg.id);
    return;
  }

  if (msg.type === 'trace') {
    const { id, imageData, mode, params } = msg;
    try {
      const svg = traceImageData(imageData, {
        mode,
        params,
        onProgress: (v) => {
          if (!cancelled.has(id)) self.postMessage({ id, type: 'progress', value: v });
        },
        isCancelled: () => cancelled.has(id),
      });
      if (cancelled.has(id) || svg === null) {
        cancelled.delete(id);
        return;
      }
      self.postMessage({ id, type: 'done', svg });
    } catch (err) {
      self.postMessage({
        id,
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
});
