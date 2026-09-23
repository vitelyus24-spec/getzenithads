import { createHash, randomUUID } from 'node:crypto';
import planConfig from '../config/plans.json' with { type: 'json' };
export class AppError extends Error { constructor(status, code, message) { super(message); this.status=status; this.code=code; } }
export const fail=(condition,status,code,message)=>{ if(!condition) throw new AppError(status,code,message); };
export const id=()=>randomUUID();
export const now=()=>new Date().toISOString();
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function planFor(key) { const p=planConfig.plans[key]; fail(p,403,'PLAN_UNKNOWN','Plan no habilitado'); return {...(p.inherits?planFor(p.inherits):{}),...p}; }
export const operationCredits=kind=>planConfig.operations[kind]?.credits;
export function authorize(org,uid,roles=['owner','editor','viewer']) {
 fail(org,404,'NOT_FOUND','Organización no encontrada');
 fail(Object.hasOwn(org.members,uid)&&roles.includes(org.members[uid].role),403,'FORBIDDEN','No tienes permiso para esta operación');
 return org.members[uid];
}
export function audit(org,uid,action,entityId,details={}) {
 org.audit_logs.push({id:id(),userId:uid,organizationId:org.id,action,entityId,at:now(),details});
}
export function initialOrg(user,name) {
 const orgId='org_'+fingerprint(user.uid).slice(0,24);
 return {schemaVersion:1,id:orgId,name,createdAt:now(),memberUids:[user.uid],members:{[user.uid]:{uid:user.uid,email:user.email||'',role:'owner',joinedAt:now()}},plan:'pilot',creditBalance:planFor('pilot').initialCredits,
 brands:{},campaigns:{},briefs:{},assets:{},generation_jobs:{},usage:[],audit_logs:[],metrics:{},trends:{},sources:{},partners:{},referrals:{},commissions:{},subscription:{status:'pilot',mode:'test'},billingEvents:{},rateWindows:{},invoices:{}};
}
export function limit(org,collection) { fail(Object.keys(org[collection]).length<planFor(org.plan).limits[collection],409,'LIMIT_REACHED','Has alcanzado el límite de prueba; no se ha realizado ningún cargo'); }
export function activePlan(org) { fail(['pilot','active','trialing'].includes(org.subscription.status),402,'SUBSCRIPTION_INACTIVE','La suscripción no está activa'); return planFor(org.plan); }
export function rateLimit(org,uid) {
 const minute=Math.floor(Date.now()/60000), old=org.rateWindows[uid];
 const window=old?.minute===minute?old:{minute,count:0};
 fail(window.count<60,429,'RATE_LIMIT','Demasiadas solicitudes. Espera un minuto'); window.count++; org.rateWindows[uid]=window;
}
export function safeSnapshot(org,uid) {
 const role=authorize(org,uid).role;
 const {billingEvents,rateWindows,invoices,partners,referrals,commissions,...out}=org;
 return {...out,members:role==='owner'?org.members:{[uid]:org.members[uid]},audit_logs:role==='owner'?org.audit_logs:[],subscription:{status:org.subscription.status,mode:org.subscription.mode,periodEnd:org.subscription.periodEnd||null},planDefinition:planFor(org.plan)};
}
