import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const app = createApp();
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('second-brain-backend');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 404 for unknown routes', async () => {
    const app = createApp();
    const res = await app.request('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});
