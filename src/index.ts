import * as core from '@actions/core';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { putMetrics } from './cloudwatch';

async function run(): Promise<void> {
  try {
    // Get inputs
    const namespace = core.getInput('namespace', { required: true });
    const metricDataStr = core.getInput('metric-data', { required: true });

    core.info('AWS CloudWatch Put Metrics');
    core.info(`Namespace: ${namespace}`);

    // Create CloudWatch client (uses AWS credentials from environment)
    const client = new CloudWatchClient({});

    // Put metrics
    const result = await putMetrics(client, namespace, metricDataStr);

    // Handle result
    if (!result.success) {
      throw new Error(result.error || 'Failed to put metrics');
    }

    // Set outputs
    core.setOutput('metrics-count', String(result.metricsCount || 0));

    // Summary
    core.info('');
    core.info('='.repeat(50));
    core.info(`Successfully published ${result.metricsCount} metric(s)`);
    core.info(`Namespace: ${namespace}`);
    core.info('='.repeat(50));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(errorMessage);
  }
}

run();
