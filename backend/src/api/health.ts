import { Hono } from 'hono';

export const health = new Hono().get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'second-brain-backend',
    timestamp: new Date().toISOString(),
  });
});
