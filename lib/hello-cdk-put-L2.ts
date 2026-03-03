import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── 1. Lambda GET /hello ─────────────────────────────────────────────────
    const helloFn = new lambda.Function(this, 'HelloFunction', {
      functionName: 'hello-handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello from CDK L2!' }),
});`),
    });

    // ─── 2. Lambda PUT /hello ─────────────────────────────────────────────────
    const greetFn = new lambda.Function(this, 'GreetFunction', {
      functionName: 'greet-handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const name = body.name || 'desconocido';
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: \`¡Hola, \${name}! Saludos desde CDK L2.\` }),
  };
};`),
    });

    // ─── 3. REST API ──────────────────────────────────────────────────────────
    const restApi = new apigateway.RestApi(this, 'HelloRestApi', {
      restApiName: 'HelloApi',
      description: 'API REST desplegada con constructores L2',
      deployOptions: {
        stageName: 'produc',
      },
    });

    // ─── 4. Recurso /hello con GET y PUT ─────────────────────────────────────
    // LambdaIntegration añade el permiso de invocación automáticamente.
    const helloResource = restApi.root.addResource('hello');
    helloResource.addMethod('GET', new apigateway.LambdaIntegration(helloFn));
    helloResource.addMethod('PUT', new apigateway.LambdaIntegration(greetFn));

    // ─── 5. Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'GetEndpoint', {
      description: 'GET  → curl <URL>',
      value: `${restApi.url}hello`,
    });

    new cdk.CfnOutput(this, 'PutEndpoint', {
      description: "PUT  → curl -X PUT <URL> -d '{\"name\":\"Tu Nombre\"}'",
      value: `${restApi.url}hello`,
    });
  }
}