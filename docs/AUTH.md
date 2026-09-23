# Autenticación, autorización y superadministración

Firebase Web modular empaquetado. Google popup; email/contraseña solo si `VITE_EMAIL_AUTH_ENABLED=true` tras comprobar proveedor. No se implementa registro público. Persistencia `browserSessionPersistence`: sesión por pestaña; logout y recuperación de contraseña. No guardar contraseñas ni ID tokens en logs.

Backend verifica `verifyIdToken(token, true)` (incluye revocación) y exige email verificado. Un ID de organización o rol enviado por navegador nunca es prueba de pertenencia. Cada operación consulta los miembros almacenados; owner administra miembros/facturación, editor trabaja contenido y viewer solo lee. Crear workspace requiere UID permitido en `PILOT_UIDS` o superadmin. No hay invitaciones por email.

## vitelyus24@gmail.com

Incluido en `config/admins.json`, importado SOLO por backend. No basta con enviar ese email ni con un flag en JSON. `principalFromFirebase` exige token válido, email_verified, consulta `getUser(uid)` y comprueba UID, email verificado coincidente y cuenta no deshabilitada. Solo ese resultado interno asigna `superadmin`.

**Recomendación antes de conectar el entorno real:** obtener el UID auténtico desde Firebase y fijarlo en `SUPERADMIN_UIDS` (lista separada por comas). Cuando hay UIDs fijados se desactiva el bootstrap por correo. Añadir otro administrador requiere configuración del servidor, no una pantalla editable por clientes.

Superadmin puede inspeccionar organizaciones globalmente mediante `/api/admin/organizations`, acceder a sus recursos y probar funciones independientemente del plan. No consume créditos, pero sí registra proveedor, coste estimado/real y auditoría. No elude `ALLOW_PAID_AI`, límite técnico de gasto, moderación, validación, límites de tamaño ni disponibilidad de proveedores. No obtiene acceso a funciones que todavía no están implementadas.

El acceso real de esta cuenta **NO se ha probado**: faltan Firebase Admin y sesión auténtica. Las pruebas ejercitan respuestas controladas del SDK y rechazan email no verificado, cuenta deshabilitada, token revocado, UID no permitido y email enviado sin identidad verificada.

## Reglas y datos

No se publicaron rules. Los fragmentos incluidos son para revisar y combinar con las reglas existentes; un `allow false` no anula otro match permisivo. No restaurar `Usuarios`/`users` ni roles históricos enviados desde cliente.
