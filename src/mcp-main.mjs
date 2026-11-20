import { serve } from './mcp.mjs';
serve().catch(error => { console.error(error.message); process.exitCode = 1; });
