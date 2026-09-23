import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())await scan(path);else if(path.endsWith('.js')){const r=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(r.status)process.exit(r.status);}}}
for(const dir of ['src','server','api','scripts','tests'])await scan(dir);
console.log('JavaScript syntax checks passed');
