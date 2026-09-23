# IA, revisión y economía por operación

## Adaptadores

`disabled` por defecto. `mock` solo local: plantilla de texto y SVG explícitamente DEMO, coste real cero. `openai`: moderación, Responses para copy y Images para imagen. Modelos y tarifas por variables; no hay modelo de pago asumido ni key. `ALLOW_PAID_AI=true` es necesario además de key/modelo/tarifa. No se ha hecho ninguna generación real.

Texto: máximo 1.500 tokens de salida; `store:false`; contexto serializado con marca, brief y campaña. Las instrucciones consideran no fiables los datos aportados, sin prometer inmunidad absoluta a prompt injection. Entrada y salida pasan moderación. Imagen incluye copy previo de la organización y formato del brief; devuelve PNG acotado a 5 MB. No se siguen URLs arbitrarias que devuelva un proveedor. Imagen generada se modera antes de almacenar. Alta precisión/retención/derechos requieren revisión contractual y benchmark real.

Brand Guardian implementa coincidencias de vocabulario prohibido/sensible, recomendación de preferidas, heurística limitada de tono/idioma, cifras no respaldadas e instrucciones explícitas de longitud/sin emojis. Declara qué comprobaciones semánticas quedan pendientes. No dice «aprobado» sin alcance.

Compliance Guardian lee reglas JSON versionadas por plataforma, país y sector. Separa política publicitaria, sector, plataforma y moderación. Las reglas actuales son heurísticas iniciales, no un corpus legal ni copia exhaustiva de políticas vigentes. Devuelve regla, riesgo, evidencia, ubicación y recomendación.

Revisión humana se registra con actor/fecha/nota. No puede levantar un bloqueo del moderador. Descarga de activos autorizada por organización; contenido de texto se escapa en UI.

## Créditos

`config/credits.json`: unidades INTERNAS de prueba, no cuotas comerciales aprobadas. Base por operación; multiplicadores por modelo, resolución, calidad y duración; suelo según coste USD estimado. Precios y capacidades históricos en `config/plans.json`; vídeo/voz deshabilitados en planes normales.

Wallet separa `included` y `purchased`. Se reserva primero incluido, después comprado, en transacción. Al conciliar se consume la parte calculada y se devuelve el sobrante al bucket correspondiente. Mocks consumen créditos de prueba para ejercitar el flujo, pero coste proveedor 0. Superadmin reserva/débito comercial 0 y conserva coste/auditoría.

Idempotencia por organización y fingerprint del request; reutilizar una clave con otro contenido devuelve conflicto. Un claim único evita doble ejecución. Fallo antes de generación libera; timeout/resultado incierto retiene y prohíbe reintentos automáticos. Máximo tres intentos seguros. Imagen con coste real todavía no deducible queda `cost_pending`, no se inventa una cifra.

`ORG_DAILY_MAX_USD` limita coste conocido del día + TODAS las reservas/pendientes, incluidas antiguas. Nunca tratar un pendiente como coste cero. Falta un límite global distribuido por cuenta/proveedor antes de habilitar generación para muchos clientes. La variable de gasto permanece false.

## Observabilidad

`/observability`: coste conocido y pendiente por usuario, organización, operación, proveedor/modelo, créditos y pruebas administrativas. Margen aparece NO CALCULABLE hasta contar con ingreso neto real, impuestos, FX, soporte y coste de infraestructura. Stripe TEST no representa ingresos.

## Pendientes externos

Credencial, elección/presupuesto de modelo, aprobación de gasto, prueba real de moderación y generación, benchmark español, retención/DPA/residencia. Vídeo/voz: contrato `AsyncMediaAdapter`, no implementación de proveedor ni exportación audiovisual operativa. No anunciar disponibles.
