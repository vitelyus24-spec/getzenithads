import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fail } from './core.js';
function validate(org,id){fail(/^org_[a-f0-9]{24}$/.test(org)&&/^[a-f0-9-]{36}$/.test(id),400,'BLOB_ID','Identificador inválido');}
export class LocalBlobs {constructor(root='.local/assets'){this.root=root;this.memory=new Map();}async put(org,id,bytes,mime){validate(org,id);if(!this.root)this.memory.set(`${org}/${id}`,bytes);else {await mkdir(join(this.root,org),{recursive:true});await writeFile(join(this.root,org,id),bytes,{mode:0o600});}return {path:`${org}/${id}`,bytes:bytes.length,mime};}async get(org,id){validate(org,id);return this.root?readFile(join(this.root,org,id)):this.memory.get(`${org}/${id}`);}}
export class FirebaseBlobs {constructor(bucket){this.bucket=bucket;}async put(org,id,bytes,mime){validate(org,id);const path=`zenit_v1/${org}/${id}`;await this.bucket.file(path).save(bytes,{resumable:false,metadata:{contentType:mime,cacheControl:'private, no-store'}});return {path,bytes:bytes.length,mime};}async get(org,id){validate(org,id);return (await this.bucket.file(`zenit_v1/${org}/${id}`).download())[0];}}
