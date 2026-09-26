// ts-jest wrapper of the @nestjs/swagger CLI plugin: the e2e tests see the same OpenAPI document
// that `nest build` produces. Keep the options in sync with nest-cli.json.
const plugin = require('@nestjs/swagger/plugin');

module.exports.name = 'nestjs-swagger-transformer';
// Bump to invalidate ts-jest's cache when the options change.
module.exports.version = 1;
module.exports.factory = (compiler) =>
  plugin.before(
    {
      introspectComments: true,
      classValidatorShim: true,
      dtoFileNameSuffix: ['.request.ts', '.response.ts', '.responses.ts', '.query.ts'],
    },
    compiler.program,
  );
