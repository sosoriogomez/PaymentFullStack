export default async function globalTeardown(): Promise<void> {
  const container = globalThis.postgresTestContainer;
  globalThis.postgresTestContainer = undefined;
  await container?.stop();
}
