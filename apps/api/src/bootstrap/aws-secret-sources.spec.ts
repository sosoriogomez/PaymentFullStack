import { type GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { awsSecretSources } from './aws-secret-sources';

describe('awsSecretSources', () => {
  const ssm = new SSMClient({ region: 'us-east-1' });
  const secretsManager = new SecretsManagerClient({ region: 'us-east-1' });
  const sources = awsSecretSources(ssm, secretsManager);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should read decrypted parameters and ignore incomplete entries', async () => {
    const send = jest.spyOn(ssm, 'send').mockResolvedValue({
      Parameters: [{ Name: '/a', Value: '1' }, { Name: '/b' }, { Value: 'orphan' }],
    } as never);

    const values = await sources.getParameters(['/a', '/b']);

    expect(values).toEqual({ '/a': '1' });
    const command = send.mock.calls[0]?.[0] as GetParametersCommand;
    expect(command).toBeInstanceOf(GetParametersCommand);
    expect(command.input).toEqual({ Names: ['/a', '/b'], WithDecryption: true });
  });

  it('should return an empty map when SSM returns no parameters', async () => {
    jest.spyOn(ssm, 'send').mockResolvedValue({} as never);

    expect(await sources.getParameters(['/missing'])).toEqual({});
  });

  it('should read secret strings', async () => {
    const send = jest
      .spyOn(secretsManager, 'send')
      .mockResolvedValue({ SecretString: 'value' } as never);

    expect(await sources.getSecretString('arn:secret')).toBe('value');
    expect((send.mock.calls[0]?.[0] as GetSecretValueCommand).input).toEqual({
      SecretId: 'arn:secret',
    });
  });

  it('should fail for binary secrets', async () => {
    jest
      .spyOn(secretsManager, 'send')
      .mockResolvedValue({ SecretBinary: new Uint8Array() } as never);

    await expect(sources.getSecretString('arn:binary')).rejects.toThrow(
      'Secret arn:binary has no string value',
    );
  });
});
