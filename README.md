# ZenithAds — getzenithads.com

Plataforma de contenido publicitario en desarrollo. Evolución del repositorio original, **no una nueva web independiente**. Producción sigue en `a7bc9d8b2e6392d179afbe12d7c8bdfcfcc08bce`.

## Ejecutar sin servicios externos ni gastos

Requiere Node >=22 y npm.

```sh
npm ci --ignore-scripts
cp .env.example .env
# En .env: APP_MODE=local, STORE=file, DEMO_AUTH=true, AI_PROVIDER=mock
npm run dev
```

Abrir http://localhost:5173. Alice y Bob son identidades de prueba explícitas. Datos en `.local/`, excluidos de Git. El servidor escucha únicamente en localhost. No usar DEMO_AUTH ni STORE=file en un hosting.

Flujo: entrar → crear workspace → marca → campaña → brief → generador de copy → trabajo → activo → revisión humana → descarga. Imagen requiere seleccionar un copy. Mock produce texto de plantilla e imagen SVG marcada DEMO; **no es IA real**.

## Verificación

```sh
npm run check        # sintaxis JS, tests de backend, build
npm run test:e2e     # Playwright: navegador local requerido
npm audit --omit=dev
```

Las pruebas E2E usan puerto 5174 y directorio de datos nuevo por ejecución. No tocan Firebase ni datos reales. Para navegador estándar: `npx playwright install chromium`. Se admite `CHROMIUM_EXECUTABLE_PATH` para un Chrome compatible ya instalado. El entorno de esta ejecución no pudo arrancar Chromium; ver informe de estado. No afirmar pruebas visuales aprobadas sin ejecutar.

## Documentación

- [Punto de recuperación](docs/RECOVERY.md)
- [Arquitectura y modelo de datos](docs/ARCHITECTURE.md)
- [Auth, roles y superadmin](docs/AUTH.md)
- [IA, Guardian y consumo](docs/AI_CREDITS.md)
- [Stripe exclusivamente TEST](docs/STRIPE.md)
- [Seguridad, privacidad y datos históricos](docs/SECURITY.md)
- [Despliegue, accesos y rollback](docs/DEPLOY.md)
- [Estado y siguiente punto de continuidad](docs/STATUS.md)

No desplegar ni fusionar a main antes de revisar el estado. `vercel.json` desactiva los deployments automáticos de esta rama. Sin pagos live, sin DNS nuevo, sin migraciones sobre las colecciones históricas.
