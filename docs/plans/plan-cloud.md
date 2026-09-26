# Plan de implementación — Cloud, CI/CD y seguridad (`infra/`, `.github/`)

> Deriva de [`spec-cloud.md`](../specs/spec-cloud.md) v1.1. El spec define **qué** infraestructura y qué controles; este plan define **cómo**: organización del código CDK, constructs, pruebas, pipelines y orden de trabajo. Ante una contradicción manda el spec, y se corrige el plan.

---

## 0. Objetivo y reglas del juego

- Publicar SPA y API en AWS **por HTTPS**, con **un solo link** (CloudFront sirve `/*` y `/api/*`), infraestructura como código, despliegue automatizado y **costo cercano a cero** durante la evaluación (20 pts de despliegue + bonus OWASP/HTTPS/headers).
- Todo es código revisable: nada se crea a mano en la consola, salvo el bootstrap único (`cdk bootstrap` + `GithubOidcStack`), que queda documentado.
- **Una feature = rama `feat/cl-<nn>-<slug>` desde `main` + PR hacia `main`.**
- **Regla de nombres:** recursos, stacks, outputs y workflows usan `checkout-*` / `PG_*`. El host y las llaves de la pasarela solo existen en GitHub Secrets/Variables y en SSM.

---

## 1. Herramientas

| Área | Elección | Uso |
|---|---|---|
| IaC | AWS CDK v2 (`aws-cdk-lib`, `constructs`) en TypeScript estricto | Stacks y constructs L3 propios |
| Reglas de seguridad IaC | `cdk-nag` (`AwsSolutionsChecks`) | Falla el synth ante hallazgos no justificados |
| Tests IaC | Jest + `aws-cdk-lib/assertions` (`Template`, `Match`, `Annotations`) | Aserciones finas; sin snapshots completos (son frágiles) |
| CI/CD | GitHub Actions, `aws-actions/configure-aws-credentials` con OIDC | Sin access keys de larga duración |
| Calidad | ESLint + Prettier compartidos con el monorepo | Mismo estándar que app y API |
| Verificación | Mozilla Observatory, SSL Labs, securityheaders.com, Lighthouse (manual) | Evidencia para el README |

---

## 2. Arquitectura del código CDK

### 2.1 Stacks y dependencias

```
bin/bootstrap-oidc.ts ──▶ GithubOidcStack   (manual, una vez)

bin/app.ts ──▶ NetworkStack ──▶ DatabaseStack ──▶ ApiStack ──▶ WebStack
```

- Las referencias entre stacks se pasan **por props tipadas** (`vpc`, `lambdaSecurityGroup`, `database`, `httpApi`, `originSecret`), nunca con nombres de exports escritos a mano.
- `bin/app.ts` lee el stage del contexto (`-c stage=prod`) y obtiene su configuración de `stage-config.ts`.

### 2.2 Configuración tipada por stage

```ts
// lib/config/stage-config.ts
export interface StageConfig {
  readonly stage: 'prod';
  readonly region: 'us-east-1';
  readonly api: {
    readonly memoryMb: number;
    readonly timeoutSeconds: number;
    readonly reservedConcurrency?: number;  // C-02: indefinido por defecto
    readonly throttle: { readonly rateLimit: number; readonly burstLimit: number };
  };
  readonly database: { readonly instanceType: string; readonly allocatedStorageGb: number; readonly backupRetentionDays: number };
  readonly reconcile: { readonly rate: Duration };
  readonly logRetention: RetentionDays;
}

export const STAGES = {
  prod: {
    stage: 'prod',
    region: 'us-east-1',
    api: { memoryMb: 1024, timeoutSeconds: 20, throttle: { rateLimit: 25, burstLimit: 50 } },
    database: { instanceType: 't4g.micro', allocatedStorageGb: 20, backupRetentionDays: 1 },
    reconcile: { rate: Duration.minutes(5) },
    logRetention: RetentionDays.TWO_WEEKS,
  },
} as const satisfies Record<string, StageConfig>;
```

### 2.3 Constructs propios (L3)

| Construct | Responsabilidad |
|---|---|
| `ApiLambda` | `lambda.Function` Node 24 arm64 en VPC, logs con retención, `NODE_OPTIONS=--enable-source-maps`, reserved concurrency opcional, permisos mínimos. Recibe `code: lambda.Code` por props (inyección: `Code.fromAsset(dist-lambda)` en la app, `Code.fromInline` en tests) |
| Schedule de reconciliación (en `ApiStack`) | `ReconcileFunction` + `scheduler.Schedule` `rate(5 minutes)` con target `LambdaInvoke`, sin reintentos y edad máxima de 4 min |
| `SecurityHeadersPolicy` | Tres `ResponseHeadersPolicy`: web, API y docs (Swagger) |
| `SpaRewriteFunction` | `cloudfront.Function` (runtime `cloudfront-js-2.0`) desde `functions/spa-rewrite.js` |

```js
// functions/spa-rewrite.js — solo en el behavior por defecto, nunca en /api/*
function handler(event) {
  var request = event.request;
  var lastSegment = request.uri.split('/').pop();
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
```

### 2.4 Buenas prácticas de IaC aplicadas

- Sin valores mágicos: todo tamaño, límite o duración sale de `StageConfig`.
- `RemovalPolicy` explícita en cada recurso con estado (RDS `SNAPSHOT`, bucket `DESTROY` + `autoDeleteObjects` solo fuera de prod, log groups `DESTROY`).
- Tags globales `project=checkout`, `stage`, `managed-by=cdk` con `Tags.of(app)`.
- `cdk-nag` como `Aspect` global; cada supresión va junto al recurso, con `reason` escrito (lista esperada en spec CL-00).
- IAM mínimo privilegio con `grant*` de CDK en vez de políticas escritas a mano; comodines acotados a prefijos del proyecto.
- Nada secreto en el código ni en el contexto: SSM (llaves de la pasarela), Secrets Manager (DB y secreto de origen generado — C-06).
- Tests de aserciones por stack para cada criterio de aceptación.

---

## 3. Diseño por componente

### 3.1 Red (`NetworkStack`)

- `ec2.Vpc` con `maxAzs: 2`, subnets `PUBLIC` (NAT), `PRIVATE_WITH_EGRESS` (Lambdas) y `PRIVATE_ISOLATED` (RDS).
- `natGatewayProvider: NatProvider.instanceV2({ instanceType: t4g.nano, machineImage: Amazon Linux 2023 arm64, defaultAllowedTraffic: OUTBOUND_ONLY })`, `natGateways: 1`.
- `LambdaSg` sin inbound; `DbSg` con inbound 5432 **solo** desde `LambdaSg`.
- Flow Logs a CloudWatch con 7 días de retención (o supresión `VPC7` justificada por costo).

### 3.2 Base de datos (`DatabaseStack`)

- `rds.DatabaseInstance`: PostgreSQL 16, `db.t4g.micro`, 20 GB gp3, `storageEncrypted`, `publiclyAccessible: false`, subnets aisladas, single-AZ, backup 1 día, `removalPolicy: SNAPSHOT`, `credentials: Credentials.fromGeneratedSecret('app_admin')`.
- Parameter group con `rds.force_ssl = 1`; la API valida el certificado con el bundle CA de RDS incluido en `dist-lambda/`.

### 3.3 API (`ApiStack`)

- Secreto de origen: `new secretsmanager.Secret(this, 'OriginVerifySecret', { generateSecretString: { passwordLength: 32, excludePunctuation: true } })` (C-06).
- `ApiFunction`, `MigrateFunction` y `ReconcileFunction` desde el mismo asset `apps/api/dist-lambda` con handlers `lambda.handler`, `migrate.handler` y `reconcile.handler` (C-01).
- Entorno no secreto: fees, timeouts, `APP_ENV=aws`, nombres de parámetros SSM y ARNs de secretos (los valores se leen en el *cold start*).
- Permisos: `ssm:GetParameters` sobre `parameter/checkout/prod/*`, `kms:Decrypt` de `aws/ssm`, `dbSecret.grantRead(fn)` y `originSecret.grantRead(apiFunction)`.
- `HttpApi` con integración `HttpLambdaIntegration` (payload v2), ruta `ANY /{proxy+}`, stage `$default` con throttling (25 rps / burst 50) y access logs JSON.
- Schedule de reconciliación de EventBridge Scheduler (C-03).

### 3.4 Web y edge (`WebStack`)

- Bucket privado: `BlockPublicAccess.BLOCK_ALL`, `enforceSSL`, cifrado S3-managed, versioning apagado.
- `Distribution`:
  - Default → `S3BucketOrigin.withOriginAccessControl(bucket)`, `CACHING_OPTIMIZED`, `REDIRECT_TO_HTTPS`, compresión, `SpaRewriteFunction` en `VIEWER_REQUEST`, política de headers web.
  - `/api/*` → `HttpOrigin(<apiId>.execute-api.us-east-1.amazonaws.com)` con `customHeaders: { 'X-Origin-Verify': originSecret.secretValue.unsafeUnwrap() }` (se sintetiza como *dynamic reference*, no como texto), `CACHING_DISABLED`, origin request policy propia (allowlist + `CloudFront-Viewer-Address`, sin `Host` — I-21), `ALLOW_ALL` methods, política de headers de API.
  - `/api/docs*` → mismo origen, política de headers de docs (CSP que admite los assets de Swagger UI del mismo origen).
  - `httpVersion: HTTP2_AND_3`, `priceClass: PRICE_CLASS_100`, `defaultRootObject: 'index.html'`.
- Política web: HSTS sin `preload` (I-12), CSP del spec CL-05 con `connect-src 'self' https://<PG_HOST>` (`pgHost` desde contexto ← GitHub Variables), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`.

---

## 4. CI/CD

### 4.1 `ci.yml` (PR y push)

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
permissions: { contents: read }
jobs:
  guards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Forbidden words
        env: { FORBIDDEN_WORDS: "${{ secrets.FORBIDDEN_WORDS }}" }
        run: |
          test -n "$FORBIDDEN_WORDS" || { echo "FORBIDDEN_WORDS secret is missing"; exit 1; }
          if git grep -I -i -l -E "$FORBIDDEN_WORDS"; then echo "Forbidden word found in the files above"; exit 1; fi
      - name: Key patterns
        run: |
          if git grep -I -n -E '(pub|prv)_(test|prod|stag[a-z]*)_[A-Za-z0-9]+|_(integrity|events)_[A-Za-z0-9]{10,}'; then exit 1; fi
  api:   # lint → typecheck → depcruise → test --coverage (Testcontainers) → build:lambda → smoke require → upload coverage + dist-lambda
  web:   # lint → stylelint → typecheck → test --coverage → build → upload coverage
  infra: # needs: api (descarga dist-lambda) → lint → test → cdk synth (cdk-nag)
  audit: # npm audit --omit=dev --audit-level=high
```

- `git grep -l` imprime solo nombres de archivo, así el log no revela la palabra prohibida.
- `actions/setup-node` con `node-version-file: .nvmrc` y caché de npm; `npm ci` una vez por job (workspaces).
- Branch protection en `main`: PR obligatorio, checks `guards`, `api`, `web`, `infra` y `audit` en verde.
- `.github/pull_request_template.md` (Qué / Por qué / Cómo probar / Checklist DoD) y `dependabot.yml` semanal (npm y github-actions).

### 4.2 `deploy.yml` (push a `main` y `workflow_dispatch`)

```yaml
permissions: { id-token: write, contents: read }
concurrency: { group: deploy-prod, cancel-in-progress: false }
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4          # .nvmrc + caché
  - run: npm ci
  - uses: aws-actions/configure-aws-credentials@v4
    with: { role-to-assume: "${{ vars.AWS_DEPLOY_ROLE_ARN }}", aws-region: us-east-1 }
  - run: npm run build:lambda -w apps/api
  - run: npx cdk deploy --all --require-approval never --outputs-file outputs.json -c stage=prod -c pgHost=${{ vars.PG_HOST }}
    working-directory: infra
  - run: ./infra/scripts/invoke-migrate.sh infra/outputs.json      # falla si FunctionError
  - run: npm run build -w apps/web
    env: { VITE_API_BASE_URL: /api, VITE_PG_BASE_URL: "${{ vars.PG_BASE_URL }}", VITE_PG_PUBLIC_KEY: "${{ vars.PG_PUBLIC_KEY }}" }
  - run: ./infra/scripts/publish-web.sh infra/outputs.json          # s3 sync con cache-control diferenciado + invalidación de /index.html
  - run: ./infra/scripts/smoke-test.sh infra/outputs.json           # /, /api/v1/health, /api/v1/products, headers, 404 JSON, 403 directo
```

- `publish-web.sh`: `aws s3 sync dist/ s3://$BUCKET --delete --exclude index.html --cache-control "public,max-age=31536000,immutable"` y luego `aws s3 cp dist/index.html s3://$BUCKET/index.html --cache-control "no-cache"`; `aws cloudfront create-invalidation --paths /index.html`.
- La llave pública de la pasarela es pública por diseño (viaja en el JS), por eso vive en GitHub Variables; la privada y los secretos solo en SSM.
- Las migraciones corren después de publicar el código: deben ser expand/contract (I-16).

---

## 5. Plan por features

### CL-00 · Scaffolding CDK — `feat/cl-00-cdk-scaffolding`

`cdk init app --language typescript` en `infra/`, npm workspaces en la raíz (`apps/*`, `infra`), TS estricto, ESLint/Prettier compartidos, `stage-config.ts`, `Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))`, tags globales, `bin/bootstrap-oidc.ts` + `GithubOidcStack` (I-17), sección README "bootstrap". **Aceptación:** `npm run synth` y `npm test` pasan.

### CL-06 · CI temprano — `feat/cl-06-ci`

Se adelanta a la fase 1 (spec overview) para que todo PR posterior pase por los gates. `ci.yml` con los jobs de §4.1 (los de api/web/infra se activan a medida que existen los proyectos), secreto `FORBIDDEN_WORDS` creado en GitHub, plantilla de PR, `dependabot.yml`, branch protection. **Aceptación:** un PR de prueba con una palabra prohibida o un patrón de llave falla; uno limpio pasa.

### CL-01 · Red — `feat/cl-01-network`

§3.1. **Tests:** existe un solo NAT (instancia `t4g.nano`); `DbSg` admite 5432 solo desde `LambdaSg`; no hay ingress `0.0.0.0/0` en ningún security group.

### CL-02 · Base de datos — `feat/cl-02-database`

§3.2. **Tests:** `StorageEncrypted: true`, `PubliclyAccessible: false`, parámetro `rds.force_ssl = 1`, `DeletionPolicy: Snapshot`.

### CL-03 · Secretos y configuración — `feat/cl-03-secrets`

`scripts/put-parameters.sh` (lee variables locales y hace `put-parameter --type SecureString --overwrite`; nunca imprime valores), permisos IAM de §3.3. **Aceptación:** el guard de patrones de llave pasa en CI; las políticas IAM no tienen `Resource: "*"` salvo las justificadas.

### CL-04 · API — `feat/cl-04-api`

§3.3 (sin el schedule de reconciliación, que se añade cuando existe BE-14). **Tests:**
```ts
const template = Template.fromStack(apiStack);
template.hasResourceProperties('AWS::Lambda::Function', {
  Runtime: 'nodejs24.x', Architectures: ['arm64'], Handler: 'lambda.handler', Timeout: 20, MemorySize: 1024,
});
template.resourcePropertiesCountIs('AWS::Lambda::Function', { ReservedConcurrentExecutions: Match.anyValue() }, 0);
template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
  StageName: '$default', DefaultRouteSettings: { ThrottlingRateLimit: 25, ThrottlingBurstLimit: 50 },
});
```
**Smoke post-deploy:** `/api/v1/health` por CloudFront → 200; `execute-api` directo sin header → 403.

### CL-05 · Web y edge — `feat/cl-05-web-edge`

§3.4. **Tests:** la función SPA está asociada solo al behavior por defecto; `/api/*` usa `CachingDisabled` y la origin request policy propia (con `CloudFront-Viewer-Address`, sin `Host`); la política web contiene CSP, HSTS sin `preload`, `DENY` y `nosniff`; el header `X-Origin-Verify` es un *dynamic reference* (no un literal). Test unitario de `spa-rewrite.js` (rutas con y sin extensión). **Aceptación:** refresh en `/transactions/<id>` sirve la SPA; `GET /api/v1/products/<uuid-inexistente>` devuelve 404 JSON; Observatory ≥ A.

### CL-07 · CD — `feat/cl-07-deploy`

`deploy.yml` y scripts de §4.2; GitHub Variables `AWS_DEPLOY_ROLE_ARN`, `PG_HOST`, `PG_BASE_URL`, `PG_PUBLIC_KEY`. **Aceptación:** push a `main` despliega de punta a punta y el smoke test pasa; un fallo de migración detiene el job antes de publicar el front.

> **Walking skeleton (fase 4):** CL-01…CL-05 + CL-07 con BE-03/FE-04 listos, para tener la URL pública mostrando el catálogo lo antes posible.

### CL-04b · Reconciliación programada — dentro de `feat/be-14-reconciliation`

Schedule de reconciliación en `ApiStack`. **Tests:** existe `AWS::Scheduler::Schedule` con `ScheduleExpression: 'rate(5 minutes)'` cuyo target es `ReconcileFunction`, y el rol del scheduler solo puede invocar esa función.

### CL-09 · Verificación de seguridad y documentación — `feat/cl-09-security-verification`

Observatory, SSL Labs y securityheaders.com sobre la URL de CloudFront con capturas en `docs/security/`; checklist OWASP de infraestructura en `docs/security/README.md` (TLS en todos los saltos, DB privada, IAM mínimo, OIDC sin llaves, secretos en SSM/Secrets Manager, logs sin datos personales); sección README "Despliegue" (diagrama, URLs, desplegar desde cero, destruir, costos). **Aceptación:** app, Swagger y repo funcionan desde un móvil real; pago aprobado y rechazado completados en producción con las tarjetas de prueba.

---

## 6. Checklist de cumplimiento del enunciado (cloud)

| Requisito | Dónde |
|---|---|
| App publicada en un proveedor cloud, conectada al backend | CL-04, CL-05, CL-07 (un solo link por CloudFront) |
| Swagger público en el README | CL-05 (`/api/docs*`), CL-09 |
| Infraestructura como código (la prueba evalúa "infrastructure as a code") | CDK completo + tests |
| Sandbox, sin dinero real | SSM con la URL de sandbox (I-09) |
| Bonus OWASP, HTTPS y headers | CL-05, CL-09, BE-11 |
| Repo público sin el nombre de la compañía | Guard `FORBIDDEN_WORDS` en CL-06 |

## 7. Costos y cierre

| Recurso | USD/mes aprox. |
|---|---|
| RDS `db.t4g.micro` + 20 GB | 12–15 (o créditos/free tier) |
| NAT instance `t4g.nano` | ~3 |
| Secrets Manager (2 secretos) | ~0.80 |
| Lambda, API Gateway, CloudFront, S3, SSM, Scheduler | ~0 al volumen de la prueba |

Tras la evaluación: `npx cdk destroy --all -c stage=prod` y borrar a mano el snapshot final de RDS si ya no se necesita (documentado).

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Deploy falla por cuota de concurrencia (cuenta nueva) | Reserved concurrency opcional (C-02) |
| Nest falla en Lambda por metadata de decoradores | Build tsc → esbuild (C-01) y smoke `require` en CI |
| La API es alcanzable sin pasar por CloudFront | Secreto `X-Origin-Verify` generado + guard en Nest (C-06) |
| CloudFront devuelve `index.html` en errores de la API | CloudFront Function solo en el behavior por defecto (no `customErrorResponses`) |
| Se filtra el nombre de la compañía o una llave | Guards de CI + `.gitignore` de `.env*` y `*.pdf` |
| Costos inesperados | Free tier: NAT instance en vez de NAT Gateway, sin RDS Proxy ni WAF; `cdk destroy` documentado para después de la evaluación |

## 9. Definition of Done (todas las features)

- [ ] `cdk synth` sin errores ni hallazgos de `cdk-nag` sin justificar.
- [ ] Tests de aserciones del criterio de aceptación en verde.
- [ ] Sin secretos ni el nombre de la compañía en código, contexto ni logs de CI.
- [ ] README/ADR actualizados si cambió la arquitectura.
- [ ] PR con plantilla completa y CI en verde antes del merge a `main`.
