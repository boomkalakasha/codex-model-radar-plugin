import { createWorker } from './worker.mjs';
import { dataDirectory } from './runtime.mjs';
async function main() {
  const worker = await createWorker({ directory: dataDirectory() });
  await worker.listen();
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await worker.close(); process.exit(0); });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
