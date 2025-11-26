import {
  CloudWatchClient,
  PutMetricDataCommand,
  MetricDatum,
  StandardUnit
} from '@aws-sdk/client-cloudwatch';
import * as core from '@actions/core';

export interface MetricResult {
  success: boolean;
  metricsCount?: number;
  error?: string;
}

interface MetricDataInput {
  MetricName: string;
  Value?: number;
  Unit?: StandardUnit;
  Timestamp?: string;
  Dimensions?: Array<{
    Name: string;
    Value: string;
  }>;
  Values?: number[];
  Counts?: number[];
  StatisticValues?: {
    SampleCount: number;
    Sum: number;
    Minimum: number;
    Maximum: number;
  };
}

/**
 * Validate namespace format
 */
export function validateNamespace(namespace: string): void {
  if (!namespace || namespace.trim().length === 0) {
    throw new Error('Namespace cannot be empty');
  }

  if (namespace.length > 255) {
    throw new Error(`Namespace exceeds maximum length of 255 characters (got ${namespace.length})`);
  }

  // CloudWatch namespace must contain only alphanumeric, hyphen, underscore, period, and forward slash
  const validPattern = /^[a-zA-Z0-9_.\-\/]+$/;
  if (!validPattern.test(namespace)) {
    throw new Error(
      `Namespace "${namespace}" contains invalid characters. ` +
      'Only alphanumeric characters, hyphens, underscores, periods, and forward slashes are allowed.'
    );
  }
}

/**
 * Parse and validate metric data from JSON string
 */
export function parseMetricData(metricDataStr: string): MetricDatum[] {
  let parsedData: MetricDataInput[];

  try {
    parsedData = JSON.parse(metricDataStr);
  } catch (error) {
    throw new Error(`Failed to parse metric-data JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(parsedData)) {
    throw new Error('metric-data must be a JSON array');
  }

  if (parsedData.length === 0) {
    throw new Error('metric-data array cannot be empty');
  }

  if (parsedData.length > 1000) {
    throw new Error(`metric-data array exceeds maximum size of 1000 metrics (got ${parsedData.length})`);
  }

  const metrics: MetricDatum[] = [];

  for (let i = 0; i < parsedData.length; i++) {
    const data = parsedData[i];

    if (!data.MetricName) {
      throw new Error(`Metric at index ${i} is missing required field 'MetricName'`);
    }

    const metric: MetricDatum = {
      MetricName: data.MetricName
    };

    // Add value if provided
    if (data.Value !== undefined) {
      metric.Value = data.Value;
    }

    // Add unit if provided
    if (data.Unit) {
      metric.Unit = data.Unit;
    }

    // Add timestamp if provided
    if (data.Timestamp) {
      metric.Timestamp = new Date(data.Timestamp);
    }

    // Add dimensions if provided
    if (data.Dimensions && Array.isArray(data.Dimensions)) {
      if (data.Dimensions.length > 30) {
        throw new Error(`Metric "${data.MetricName}" has too many dimensions (max 30, got ${data.Dimensions.length})`);
      }
      metric.Dimensions = data.Dimensions;
    }

    // Add values/counts for statistic sets
    if (data.Values) {
      metric.Values = data.Values;
    }
    if (data.Counts) {
      metric.Counts = data.Counts;
    }

    // Add statistic values if provided
    if (data.StatisticValues) {
      metric.StatisticValues = data.StatisticValues;
    }

    // Validate that at least one data point is provided
    if (
      metric.Value === undefined &&
      !metric.Values &&
      !metric.StatisticValues
    ) {
      throw new Error(
        `Metric "${data.MetricName}" must have at least one of: Value, Values, or StatisticValues`
      );
    }

    metrics.push(metric);
  }

  return metrics;
}

/**
 * Put metrics to CloudWatch
 */
export async function putMetrics(
  client: CloudWatchClient,
  namespace: string,
  metricDataStr: string
): Promise<MetricResult> {
  try {
    // Validate namespace
    validateNamespace(namespace);

    core.info(`Parsing metric data...`);

    // Parse and validate metric data
    const metricData = parseMetricData(metricDataStr);

    core.info(`Publishing ${metricData.length} metric(s) to namespace "${namespace}"`);

    // CloudWatch has a limit of 1000 metrics per request, but we've already validated this
    const command = new PutMetricDataCommand({
      Namespace: namespace,
      MetricData: metricData
    });

    await client.send(command);

    core.info('✓ Metrics published successfully');

    // Log each metric for visibility
    for (const metric of metricData) {
      const dims = metric.Dimensions
        ? ` [${metric.Dimensions.map(d => `${d.Name}=${d.Value}`).join(', ')}]`
        : '';
      const value = metric.Value !== undefined ? metric.Value : 'statistic-set';
      const unit = metric.Unit ? ` ${metric.Unit}` : '';
      core.info(`  - ${metric.MetricName}${dims}: ${value}${unit}`);
    }

    return {
      success: true,
      metricsCount: metricData.length
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.error(`Failed to put metrics: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage
    };
  }
}
