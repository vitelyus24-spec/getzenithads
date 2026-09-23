# Arquitectura y decisiones

## ADR-001: evolución mínima

Se conserva HTML/CSS/JavaScript, Firebase y destino Vercel. Vite sustituye los CDN runtime y genera assets con hashes. No se incorpora React/Next ni otro sistema de autenticación. La identidad oscura, azul/ámbar y ZenithAds se mantiene. `index.html` es entrada; `src/auth.js`, `src/main.js`, `src/landing.js`, `src/style.css` separan responsabilidades.

Backend Node: `server/http.js` rutas/transportes, `runtime.js` composición, `identity.js` identidad verificada, `service.js` operaciones autorizadas, `store.js` persistencia, `providers.js` adaptadores IA, `billing.js` Stripe. Handler compartido entre servidor local y función Vercel (`api/index.js`).

## ADR-002: aislamiento sin restaurar colecciones antiguas

Namespace NUEVO: `zenit_v1_organizations/{organizationId}` y `zenit_v1_users/{uid}`. No se escribe en `Usuarios` ni `users`. No hay migración automática ni borrados.

Cada organización es un agregado transaccional acotado que contiene:

| Entidad                        | Implementación                                                           |
| ------------------------------ | ------------------------------------------------------------------------ |
| users                          | Índice Firebase UID, email, fecha; identidad no editable por API         |
| organizations                  | Nombre, ID determinista para workspace inicial, schemaVersion            |
| members                        | UID/rol, `memberUids` para búsqueda; owner/editor/viewer                 |
| brands                         | Perfil completo, relaciones por ID interno                               |
| campaigns                      | Marca, plataforma, país, objetivo                                        |
| briefs                         | Campaña, oferta, objetivo, CTA, formato, restricciones                   |
| assets                         | Resultado o referencia a blob, revisión/Guardian, autor, demo            |
| generation_jobs                | Snapshot de input, estado, intentos, clave de idempotencia, reserva      |
| usage                          | Una fila por job; proveedor/modelo, estimado/real, reservas/conciliación |
| subscriptions                  | Cliente/subcripción Stripe TEST, estado, hold y periodo                  |
| audit_logs                     | Eventos append-only por API; no se ofrece borrado                        |
| metrics/sources/trends         | Datos manuales con evidencia y procedencia                               |
| partners/referrals/commissions | Borradores y candidatos pendientes de política                           |
| wallet/creditPurchases         | Créditos incluidos/comprados y compras test idempotentes                 |

**Límite deliberado del piloto:** agregado <700.000 bytes; tablas pequeñas, sin paginación masiva ni escalado horizontal de escritura por organización. Las transacciones Firestore garantizan coherencia del saldo/estado dentro de este agregado. Antes de escalar, separar jobs/ledger/audit en subcolecciones con transacciones sobre wallet. No se vende este diseño como ilimitado. Las credenciales Admin no están disponibles y el adaptador Firestore aún requiere prueba en emulador/proyecto aislado.

`LocalStore` usa una cola de transacciones, copia antes de mutar y persistencia mediante rename atómico. Es para UN proceso local; no es una base de datos para producción/serverless. `FirestoreStore` usa transacciones nativas. No hay llamadas de proveedores dentro de una transacción Firestore: las reejecuciones de una transacción nunca deben duplicar llamadas de pago.

Blobs fuera del agregado: archivos locales o bucket Firebase bajo `zenit_v1/{org}/{asset}`. Descarga a través de backend con Bearer token. No se exponen enlaces públicos permanentes ni URLs firmadas en listados.

## Cola y límites actuales

Trabajos `queued → running → completed/review_required/failed/uncertain`. Claim transaccional único. UI dispara ejecución explícita; también existe worker autenticado. No hay cron ni cola gestionada activada. Interrupción >2 minutos se marca uncertain, nunca se repite automáticamente. Vídeo/voz tienen contrato de adaptador, estados y costes preparados; no proveedor operativo.

## Modelo de crecimiento

Antes de piloto externo: Firestore probado, regla que impida lectura directa de namespace, límites por usuario y gateway, reconciliador administrativo de costes inciertos, cola durable gestionada si se superan tiempos de función, archivado y backups. Conectar solo después de revisar la configuración original.
