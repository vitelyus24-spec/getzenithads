// Explicit worker invocation only; never automatically schedules paid work.
const [organizationId, jobId] = process.argv.slice(2);
if (!organizationId || !jobId || !process.env.WORKER_SECRET)
  throw new Error('Usage: npm run worker -- org_id job_id; WORKER_SECRET required');
const r = await fetch(`${process.env.APP_ORIGIN}/api/worker/run`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.WORKER_SECRET}`,
    Origin: process.env.APP_ORIGIN,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ organizationId, jobId }),
});
console.log(r.status, await r.text());
