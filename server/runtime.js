import { initializeApp,getApps,cert,applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { LocalStore,FirestoreStore } from './store.js';
import { LocalBlobs,FirebaseBlobs } from './blobs.js';
import { providerFor } from './providers.js';
import { Service } from './service.js';
import { Billing } from './billing.js';
import { fail } from './core.js';
export async function createRuntime(env=process.env){
 const local=env.APP_MODE==='local'&&!env.VERCEL&&env.NODE_ENV!=='production';
 fail(env.DEMO_AUTH!=='true'||local,503,'DEMO_FORBIDDEN','Autenticación DEMO prohibida fuera de localhost');
 fail(env.STORE!=='file'||local,503,'FILE_STORE_FORBIDDEN','Persistencia local prohibida en hosting');
 let store,blobs,auth;
 if(local&&env.STORE==='file'){store=await new LocalStore('.local/database.json').init();blobs=new LocalBlobs();}
 if(env.FIREBASE_SERVICE_ACCOUNT_JSON||env.STORE==='firestore'){
 const app=getApps()[0]||initializeApp({credential:env.FIREBASE_SERVICE_ACCOUNT_JSON?cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)):applicationDefault(),projectId:env.FIREBASE_PROJECT_ID,storageBucket:env.FIREBASE_STORAGE_BUCKET});auth=getAuth(app);
 if(env.STORE==='firestore'){store=new FirestoreStore(getFirestore(app));blobs=new FirebaseBlobs(getStorage(app).bucket());}
 }
 fail(store,503,'BACKEND_NOT_CONFIGURED','Backend privado pendiente de configuración');
 const verify=async token=>{if(local&&env.DEMO_AUTH==='true'&&['demo-alice','demo-bob'].includes(token))return {uid:token,email:token+'@example.invalid',email_verified:true,demo:true};fail(auth,503,'AUTH_NOT_CONFIGURED','Firebase Admin pendiente de credenciales');try{const user=await auth.verifyIdToken(token,true);fail(user.email_verified,403,'EMAIL_UNVERIFIED','Verifica tu correo antes de continuar');return user;}catch(error){if(error.status)throw error;fail(false,401,'INVALID_TOKEN','Sesión inválida o caducada');}};
 return {env,store,blobs,verify,service:new Service(store,providerFor(env),blobs,env),billing:new Billing(store,env)};
}
