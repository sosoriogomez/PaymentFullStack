import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { type SecretSources } from './secrets-loader';

/** AWS adapters of SecretSources. Credentials and region come from the Lambda execution role. */
export function awsSecretSources(
  ssm: SSMClient = new SSMClient({}),
  secretsManager: SecretsManagerClient = new SecretsManagerClient({}),
): SecretSources {
  return {
    async getParameters(names) {
      const output = await ssm.send(
        new GetParametersCommand({ Names: [...names], WithDecryption: true }),
      );
      return Object.fromEntries(
        (output.Parameters ?? []).flatMap((parameter) =>
          parameter.Name && parameter.Value !== undefined
            ? [[parameter.Name, parameter.Value]]
            : [],
        ),
      );
    },
    async getSecretString(secretId) {
      const output = await secretsManager.send(new GetSecretValueCommand({ SecretId: secretId }));
      if (output.SecretString === undefined)
        throw new Error(`Secret ${secretId} has no string value`);
      return output.SecretString;
    },
  };
}
