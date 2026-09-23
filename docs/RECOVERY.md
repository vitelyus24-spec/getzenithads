# Recuperación del corte — 23/09/2026

Rama local y remota: `dev/mvp-2026-09`. Base intacta: `a7bc9d8b2e6392d179afbe12d7c8bdfcfcc08bce`.

Se encontraron 27 archivos nuevos/modificados de implementación, package-lock y dependencias instaladas, todavía SIN commits posteriores a la base. No se perdieron ni se sustituyeron. Backend, UI, adapters y tests estaban escritos.

Verificación al retomar: **25 tests ejecutados y aprobados**; build Vite aprobado (103,34 kB JS, 32,46 kB gzip). Las pruebas externas Firebase/Stripe/IA no se habían realizado; se mantiene esa distinción.

Vercel conectado devuelve 403 en el equipo propietario `aitor-garcias-projects-49f01384`; no se despliega. GitHub permite lectura/escritura. `vercel.json` desactiva deployments Git en esta rama para que subir código no consuma recursos ni toque producción; antes de merge debe revisarse expresamente esta configuración.

Tag LOCAL de referencia `recovery/production-2026-01`. La referencia de rollback remota sigue siendo el SHA público original. No se reescribe historial.
