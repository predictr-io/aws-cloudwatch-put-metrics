# AWS CloudWatch Put Metrics

A GitHub Action to publish custom metrics to AWS CloudWatch. Track deployments, workflow performance, test results, and any custom metrics from your CI/CD pipeline.

## Features

- **Publish custom metrics** - Send metrics from your workflows to CloudWatch
- **Multiple metrics at once** - Publish up to 1000 metrics in a single call
- **Dimensions support** - Add up to 30 dimensions per metric for filtering
- **Units** - Support for all CloudWatch standard units
- **Statistic sets** - Publish pre-aggregated statistics for efficiency
- **Simple integration** - Easy to use in GitHub Actions workflows

## Prerequisites

Configure AWS credentials before using this action.

### Option 1: AWS Credentials (Production)

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/my-github-actions-role
    aws-region: us-east-1
```

### Option 2: LocalStack (Testing)

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      localstack:
        image: localstack/localstack
        ports:
          - 4566:4566
        env:
          SERVICES: cloudwatch
    steps:
      - name: Put metrics to LocalStack
        uses: predictr-io/aws-cloudwatch-put-metrics@v0
        env:
          AWS_ENDPOINT_URL: http://localhost:4566
          AWS_ACCESS_KEY_ID: test
          AWS_SECRET_ACCESS_KEY: test
          AWS_DEFAULT_REGION: us-east-1
        with:
          namespace: 'MyApp/CI'
          metric-data: |
            [
              {
                "MetricName": "BuildDuration",
                "Value": 45.2,
                "Unit": "Seconds"
              }
            ]
```

## Usage

### Publish Single Metric

```yaml
- name: Track deployment
  uses: predictr-io/aws-cloudwatch-put-metrics@v0
  with:
    namespace: 'MyApp/Deployments'
    metric-data: |
      [
        {
          "MetricName": "DeploymentCount",
          "Value": 1,
          "Unit": "Count",
          "Dimensions": [
            {
              "Name": "Environment",
              "Value": "production"
            },
            {
              "Name": "Service",
              "Value": "api"
            }
          ]
        }
      ]
```

### Publish Multiple Metrics

```yaml
- name: Track build metrics
  uses: predictr-io/aws-cloudwatch-put-metrics@v0
  with:
    namespace: 'MyApp/CI'
    metric-data: |
      [
        {
          "MetricName": "BuildDuration",
          "Value": 127.5,
          "Unit": "Seconds",
          "Dimensions": [
            {"Name": "Branch", "Value": "main"}
          ]
        },
        {
          "MetricName": "TestsPassed",
          "Value": 452,
          "Unit": "Count"
        },
        {
          "MetricName": "TestsFailed",
          "Value": 0,
          "Unit": "Count"
        },
        {
          "MetricName": "CodeCoverage",
          "Value": 87.3,
          "Unit": "Percent"
        }
      ]
```

### Track Deployment Success/Failure

```yaml
- name: Deploy application
  id: deploy
  run: |
    ./deploy.sh
  continue-on-error: true

- name: Record deployment metric
  if: always()
  uses: predictr-io/aws-cloudwatch-put-metrics@v0
  with:
    namespace: 'MyApp/Deployments'
    metric-data: |
      [
        {
          "MetricName": "DeploymentResult",
          "Value": ${{ steps.deploy.outcome == 'success' && 1 || 0 }},
          "Unit": "None",
          "Dimensions": [
            {
              "Name": "Environment",
              "Value": "production"
            },
            {
              "Name": "Status",
              "Value": "${{ steps.deploy.outcome }}"
            }
          ]
        }
      ]
```

### Publish Statistic Sets

For pre-aggregated data:

```yaml
- name: Publish aggregated metrics
  uses: predictr-io/aws-cloudwatch-put-metrics@v0
  with:
    namespace: 'MyApp/Performance'
    metric-data: |
      [
        {
          "MetricName": "ResponseTime",
          "Unit": "Milliseconds",
          "StatisticValues": {
            "SampleCount": 1000,
            "Sum": 45234.5,
            "Minimum": 12.3,
            "Maximum": 892.1
          }
        }
      ]
```

### Complete Workflow Example

```yaml
name: Deploy and Monitor

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Run tests
        id: test
        run: |
          START_TIME=$(date +%s)
          npm test
          END_TIME=$(date +%s)
          DURATION=$((END_TIME - START_TIME))
          echo "duration=$DURATION" >> $GITHUB_OUTPUT

      - name: Deploy
        id: deploy
        run: ./deploy.sh
        continue-on-error: true

      - name: Publish CI metrics
        if: always()
        uses: predictr-io/aws-cloudwatch-put-metrics@v0
        with:
          namespace: 'MyApp/CI'
          metric-data: |
            [
              {
                "MetricName": "TestDuration",
                "Value": ${{ steps.test.outputs.duration }},
                "Unit": "Seconds",
                "Dimensions": [
                  {"Name": "Branch", "Value": "${{ github.ref_name }}"},
                  {"Name": "Repository", "Value": "${{ github.repository }}"}
                ]
              },
              {
                "MetricName": "DeploymentSuccess",
                "Value": ${{ steps.deploy.outcome == 'success' && 1 || 0 }},
                "Unit": "None",
                "Dimensions": [
                  {"Name": "Environment", "Value": "production"},
                  {"Name": "Result", "Value": "${{ steps.deploy.outcome }}"}
                ]
              },
              {
                "MetricName": "BuildNumber",
                "Value": ${{ github.run_number }},
                "Unit": "Count"
              }
            ]
```

## Inputs

### Required Inputs

| Input | Description |
|-------|-------------|
| `namespace` | CloudWatch namespace for the metrics (e.g., `MyApp/Performance`). Max 255 characters. |
| `metric-data` | Metric data as JSON array. See [Metric Data Format](#metric-data-format) below. |

## Outputs

| Output | Description |
|--------|-------------|
| `metrics-count` | Number of metrics successfully published |

## Metric Data Format

The `metric-data` input must be a JSON array of metric objects. Each metric must have:

### Required Fields

- **`MetricName`** (string) - Name of the metric

### At Least One Data Field

- **`Value`** (number) - Single data point value
- **`Values`** (number[]) - Array of values for statistic sets
- **`StatisticValues`** (object) - Pre-aggregated statistics

### Optional Fields

- **`Unit`** (string) - Unit of measurement (see [Units](#units) below)
- **`Timestamp`** (string) - ISO 8601 timestamp (defaults to current time)
- **`Dimensions`** (array) - Array of dimension objects (max 30)
- **`Counts`** (number[]) - Array of counts for statistic sets

### Dimensions Format

```json
{
  "Name": "DimensionName",
  "Value": "DimensionValue"
}
```

### Statistic Values Format

```json
{
  "SampleCount": 100,
  "Sum": 1234.5,
  "Minimum": 10.2,
  "Maximum": 50.8
}
```

## Units

Supported CloudWatch units:

**Time:** `Seconds`, `Microseconds`, `Milliseconds`

**Data:** `Bytes`, `Kilobytes`, `Megabytes`, `Gigabytes`, `Terabytes`, `Bits`, `Kilobits`, `Megabits`, `Gigabits`, `Terabits`

**Rate:** `Bytes/Second`, `Kilobytes/Second`, `Megabytes/Second`, `Gigabytes/Second`, `Terabytes/Second`, `Bits/Second`, `Kilobits/Second`, `Megabits/Second`, `Gigabits/Second`, `Terabits/Second`, `Count/Second`

**Other:** `Count`, `Percent`, `None`

## Limits

- **Metrics per request**: 1000
- **Dimensions per metric**: 30
- **Namespace length**: 255 characters
- **Metric name length**: 255 characters
- **Dimension name length**: 255 characters
- **Dimension value length**: 1024 characters

## Error Handling

The action handles common scenarios:

- **Empty metrics array**: Fails with validation error
- **Missing required fields**: Fails with descriptive error
- **Too many metrics**: Fails if more than 1000 metrics
- **Invalid JSON**: Fails with parsing error
- **Invalid namespace**: Fails with validation error
- **AWS permission errors**: Fails with AWS SDK error message

## Use Cases

### Track Deployment Frequency

```yaml
- name: Track deployment
  uses: predictr-io/aws-cloudwatch-put-metrics@v0
  with:
    namespace: 'MyApp/DORA'
    metric-data: |
      [
        {
          "MetricName": "DeploymentFrequency",
          "Value": 1,
          "Unit": "Count",
          "Dimensions": [
            {"Name": "Team", "Value": "backend"}
          ]
        }
      ]
```

### Monitor Build Times

```yaml
- name: Build application
  id: build
  run: |
    START=$(date +%s)
    npm run build
    END=$(date +%s)
    echo "duration=$((END - START))" >> $GITHUB_OUTPUT

- name: Record build time
  uses: predictr-io/aws-cloudwatch-put-metrics@v0
  with:
    namespace: 'MyApp/CI'
    metric-data: |
      [
        {
          "MetricName": "BuildDuration",
          "Value": ${{ steps.build.outputs.duration }},
          "Unit": "Seconds"
        }
      ]
```

### Track Test Results

```yaml
- name: Run tests
  id: test
  run: |
    npm test -- --json > test-results.json
    PASSED=$(jq '.numPassedTests' test-results.json)
    FAILED=$(jq '.numFailedTests' test-results.json)
    echo "passed=$PASSED" >> $GITHUB_OUTPUT
    echo "failed=$FAILED" >> $GITHUB_OUTPUT

- name: Record test metrics
  if: always()
  uses: predictr-io/aws-cloudwatch-put-metrics@v0
  with:
    namespace: 'MyApp/Tests'
    metric-data: |
      [
        {
          "MetricName": "TestsPassed",
          "Value": ${{ steps.test.outputs.passed }},
          "Unit": "Count"
        },
        {
          "MetricName": "TestsFailed",
          "Value": ${{ steps.test.outputs.failed }},
          "Unit": "Count"
        }
      ]
```

## Development

### Setup

```bash
git clone https://github.com/predictr-io/aws-cloudwatch-put-metrics.git
cd aws-cloudwatch-put-metrics
npm install
```

### Scripts

```bash
npm run build      # Build the action
npm run type-check # TypeScript checking
npm run lint       # ESLint
npm run check      # Run all checks
```

## License

MIT
