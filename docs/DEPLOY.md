# Despliegue y rollback

Producción no se modifica. Rama de trabajo: `dev/mvp-2026-09`; base exacta `a7bc9d8b2e6392d179afbe12d7c8bdfcfcc08bce`. Tag local `recovery/production-2026-01` conserva la referencia.

## Vercel

La conexión devuelve 403 al consultar `getzenithads` en `aitor-garcias-projects-49f01384`: necesita autenticación con acceso a ese scope. No se ha creado proyecto alternativo, contratado plan ni cambiado dominios. GitHub sí permite escribir en la rama mediante conector; terminal no tiene credenciales Git.

`vercel.json`: build npm/Vite, salida dist, rewrites API y headers. `git.deploymentEnabled=false` evita deployment automático al guardar esta rama. Revisar y cambiar ESTA opción únicamente después de disponer de permisos y presupuesto/plan confirmados. No fusionar tal cual a main: desactivaría deployments Git de esa versión.

## Preview segura después de desbloqueo

1. Conectar Vercel al equipo propietario, leer plan/config/domains/env y confirmar que preview no añade coste.
2. Inspeccionar Firebase original, exportar/respaldar lo necesario sin datos innecesarios. Preferir proyecto/emulador de pruebas aislado.
3. Configurar las variables de `.env.example` solo en Preview. Nunca VITE_* para secretos; Admin SDK en secreto de servidor o identidad federada. No imprimir valores.
4. `STORE=firestore`, APP_MODE=preview, DEMO_AUTH=false, AI_PROVIDER=disabled, ALLOW_PAID_AI=false. Configurar reglas revisadas para namespace nuevo, Storage e IAM mínimos. No sobrescribir rules existentes con los fragmentos.
5. Build/check y deploy PREVIEW explícito; verificar login popup, email si habilitado, logout, recarga, permisos entre dos usuarios, Storage y CSP.
6. Habilitar proveedor solo tras presupuesto y autorización. Stripe siempre TEST. Ninguna acción de esta guía activa producción.

## Rollback

Mientras no se despliegue, no hace falta rollback de producción. Revertir cambios de desarrollo mediante nuevos commits, sin reescribir main. Si posteriormente se publica, conservar el deployment anterior y promoverlo solo con autorización; no ejecutar reset --hard ni force-push. Los datos nuevos están separados por namespace y no deben borrarse como parte de una reversión de frontend.

## Acciones concretas que faltan del titular

- Vercel: conceder al conector acceso a `aitor-garcias-projects-49f01384`.
- Firebase: acceso seguro al proyecto `zenithads-core`, lectura de Auth/rules/colecciones/Storage/IAM; confirmar UID de vitelyus24@gmail.com para fijarlo.
- Stripe: credencial TEST y webhook de prueba mediante secretos del entorno, no en chat.
- IA: seleccionar proveedor/modelo y aprobar techo de gasto antes de activar key.

No se ha solicitado contraseña ni 2FA por chat. DNS y dominio permanecen intactos.
