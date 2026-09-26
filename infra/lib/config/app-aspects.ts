import { Aspects, type App, Tags } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { PROJECT, type StageConfig } from './stage-config';

/** Tags every resource and runs the AWS Solutions rule pack on the whole app. */
export function applyProjectAspects(app: App, config: StageConfig): void {
  Tags.of(app).add('project', PROJECT);
  Tags.of(app).add('stage', config.stage);
  Tags.of(app).add('managed-by', 'cdk');
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
}
