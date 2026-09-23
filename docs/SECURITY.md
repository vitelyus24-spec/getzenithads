# Seguridad y privacidad — estado verificable

## Implementado y probado localmente

- Bearer Firebase verificado con revocación; no cookie de sesión backend. Mutaciones exigen Origin exacto y JSON. Sin CORS abierto.
- Autorización servidor por organización/rol; superadmin solo principal verificado. Rechazo de campos inesperados con Zod.
- Escapado de todo texto insertado en UI; URLs de referencia HTTPS validadas y no descargadas en backend. No subidas de HTML/SVG arbitrario de usuarios. Mock SVG fijo no incluye datos de usuario.
- Body máximo 100 kB; archivo generado máximo 5 MB, PNG verificado por firma. Agregado máximo 700 kB. Persistencia local solo localhost; flags demo/file rechazados en hosting.
- Rate limit persistido de 60 mutaciones/min por usuario y organización. Falta rate limit distribuido de tráfico anónimo/lecturas antes de piloto externo; no presentar el actual como WAF.
- No claves privadas en frontend; `.env` excluido. Logs HTTP dev no muestran tokens/prompts. Errores 500 genéricos con request ID.
- CSP, nosniff, no-referrer, framing y Permissions-Policy preparados en vercel.json. Cabeceras API verificadas en test HTTP. CSP completa no probada en Vercel/Google popup todavía.
- Stripe firma raw body, mode TEST, idempotencia y customer/subscription mapping. Hold conservador ante reembolso/disputa.
- Reserva atómica, no reintento de resultado incierto, presupuesto por organización. Falta kill switch/presupuesto GLOBAL distribuido antes de consumo masivo.

## Revisiones aún necesarias

Firebase IAM, rules/Storage y sus matches amplios, proveedor Google/password, lista de dominios, UID superadmin, emulador, revocación real, backups/restauración. Prueba de SDK contra Firestore real no realizada. Una transacción Admin elude rules: seguridad depende del backend + IAM, y rules deben impedir rutas directas desde cliente.

Browser/teclado/contraste/responsive: scripts preparados, pero motor Chromium del entorno no arrancó. No afirmar aprobación visual/Lighthouse. Las comprobaciones DOM no sustituyen un navegador.

El script `lint` comprueba sintaxis, no equivale a ESLint ni análisis formal de seguridad. Tests son pruebas funcionales acotadas, no pentest.

## Datos personales históricos

En la primera versión (`f24985ad`, `index.html`) hay objeto de configuración legal con **nombre/apellidos del titular, DNI/NIF, domicilio completo y teléfono/WhatsApp**, renderizado en la sección fiscal/soporte. La auditoría anterior ya documentó su existencia. No se copian valores completos a otra rama/documento público para no ampliar la exposición. El archivo actual nuevo no los incluye. El email de superadmin es el autorizado expresamente por el titular para esa función y se mantiene exclusivamente en configuración del backend.

Opciones pendientes de decisión del titular: conservar solo identificación legal exigible en la web final; valorar hacer privado el repo (no elimina copias previas); retirar datos del historial mediante procedimiento GitHub/filter-repo SOLO con autorización expresa, coordinación de clones y revisión de referencias; pedir retirada de cachés cuando proceda. No se ha cambiado visibilidad ni reescrito Git.

La API key web Firebase del historial es configuración pública del SDK; restricciones/API habilitadas/alerta GitHub quedan por comprobar. No se ha rotado ni copiado a los nuevos archivos.

## Inventario de almacenamiento y legal

Producción nueva no se ha publicado. Frontend local: no analytics/marketing, ni fuentes/vídeos externos. Firebase, cuando se configura, usa session storage para identidad. DEMO mantiene token ficticio en memoria, no login persistente. Backend local conserva JSON/blobs; Firestore/Storage preparados pero no conectados. Descargas blob temporales se revocan.

Enlaces visibles a seis borradores legales en diálogo accesible. No se simula un consentimiento para trackers que no existen. Si se añade analytics/marketing, inventariar y bloquear carga antes del consentimiento cuando corresponda. Completar titular/contacto/retención/DPA/encargados/transferencias/cancelación/créditos/IP con revisión profesional. No es apto para contratación todavía.
