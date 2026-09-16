import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync('index.html','utf8');
assert(html.includes('/src/management/main.tsx'),'The connected management app must be the entrypoint.');
assert(existsSync('.env.example'),'Document client configuration.');
const ignore=readFileSync('.gitignore','utf8');
assert(ignore.includes('.env.*'),'Ignore secret environment files.');
const client=readFileSync('src/management/client.ts','utf8');
assert(!client.includes('service_role'),'Privileged credentials cannot be bundled.');
