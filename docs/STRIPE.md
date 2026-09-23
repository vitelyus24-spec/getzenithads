# Stripe — exclusivamente TEST

Ninguna key cargada, ningún producto creado por esta ejecución y ningún cargo realizado. Código rechaza claves distintas de `sk_test_` y eventos `livemode !== false`. No hay interruptor live.

`npm run stripe:catalog -- --create-test-catalog` prepara productos/prices 19/49/149/299 EUR con nombres TEST; requiere key TEST y ejecutarlo explícitamente. Operaciones idempotentes. Rellenar `STRIPE_PRICE_MAP_JSON` con IDs retornados. Las cifras son históricas, no oferta publicada.

Checkout valida Price, EUR, recurrencia, importe, modo test, cliente de la organización y rol del solicitante. Customer tiene metadata organización/FirebaseUID. Portal requiere owner/superadmin. La success_url solo vuelve a UI: NO cambia derechos.

Webhook usa bytes sin parsear, firma SDK Stripe y tolerancia 300 s. Eventos idempotentes; suscripción se consulta en Stripe para usar su estado ACTUAL frente a llegada desordenada. Exige metadata/customer/Price esperados. Facturas pagadas de creación/ciclo acreditan solo una vez; prorrateos no abonan automáticamente otra cuota completa. Cancelación/impago restringen generación. Reembolso/disputa aplican billingHold conservador y retienen comisiones. Liberar hold exige revisión administrativa posterior; no se reabre con un evento antiguo.

Paquetes: `config/credits.json.packs` vacío (sin oferta aprobada). Arquitectura de Checkout payment y fulfillment por webhook verificado, importe/Price/currency/customer/metadata/cantidad exactos, registro por sesión único y abono a `purchased`. Nunca abonar por success_url. Pruebas usan paquete ficticio inyectado, no existe un paquete publicado.

Pendientes: acceso Dashboard TEST, catálogo real, webhook en URL accesible, firma real con Stripe CLI/test Dashboard, portal configurado, políticas de cambio/refund/créditos. Pruebas locales verifican firmas auténticas SDK con secreto de fixture y transportes simulados; no equivalen a un checkout completado en Stripe.
