/**
 * Reglas de la arquitectura hexagonal (spec-backend §2.1, plan-backend §2.1).
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Las dependencias circulares ocultan acoplamiento y rompen la inicialización.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'El dominio y el kernel son TypeScript puro: no conocen aplicación, infraestructura ni frameworks.',
      from: { path: '^src/(modules/[^/]+/domain|shared/kernel)/' },
      to: {
        path: [
          '^src/modules/[^/]+/(application|infrastructure)/',
          '^src/shared/infrastructure/',
          'node_modules/(@nestjs|typeorm|pg|zod|express|@aws-sdk)/',
        ],
      },
    },
    {
      name: 'application-depends-only-on-domain',
      severity: 'error',
      comment: 'Los casos de uso dependen de puertos, nunca de adaptadores ni de frameworks.',
      from: { path: '^src/modules/[^/]+/application/' },
      to: {
        path: [
          '^src/modules/[^/]+/infrastructure/',
          '^src/shared/infrastructure/',
          'node_modules/(@nestjs|typeorm|pg|express|@aws-sdk)/',
        ],
      },
    },
    {
      name: 'modules-talk-through-ports',
      severity: 'error',
      comment: 'Un módulo no importa adaptadores de otro módulo.',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/infrastructure/', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
