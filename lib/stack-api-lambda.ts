import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── 1. Lambda función inline ─────────────────────────────────────────────
    // L2: lambda.Function crea y adjunta el rol IAM automáticamente.
    // Ya no hace falta CfnRole ni CfnPermission.
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

    // ─── 2. REST API ──────────────────────────────────────────────────────────
    // L2: RestApi gestiona el deployment y el stage por defecto.
    // deployOptions permite configurar el stage sin CfnStage/CfnDeployment.
    const restApi = new apigateway.RestApi(this, 'HelloRestApi', {
      restApiName: 'HelloApi',
      description: 'API REST desplegada con constructores L2',
      deployOptions: {
        stageName: 'produc',
      },
    });

    // ─── 3. Recurso /hello + método GET ──────────────────────────────────────
    // L2: addResource y addMethod en una sola cadena fluida.
    // LambdaIntegration genera la URI de invocación y el permiso automáticamente.
    const helloResource = restApi.root.addResource('hello');
    helloResource.addMethod('GET', new apigateway.LambdaIntegration(helloFn));

    // ─── 4. Output con el endpoint público ───────────────────────────────────
    // L2: restApi.url ya contiene la URL base del stage configurado.
    new cdk.CfnOutput(this, 'HelloEndpoint', {
      description: 'Endpoint público — prueba con: curl <URL>',
      value: `${restApi.url}hello`,
    });
  }
}