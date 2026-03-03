import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── Rol compartido para ambas Lambdas ────────────────────────────────────
    const lambdaRole = new iam.CfnRole(this, 'LambdaRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
          Action: 'sts:AssumeRole',
        }],
      },
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      ],
    });

    // ─── 1. Lambda GET /hello ─────────────────────────────────────────────────
    const helloFn = new lambda.CfnFunction(this, 'HelloFunction', {
      functionName: 'hello-handler',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      role: lambdaRole.attrArn,
      code: {
        zipFile: `
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello from CDK L1!' }),
});`,
      },
    });

    // ─── 2. Lambda PUT /hello ─────────────────────────────────────────────────
    const greetFn = new lambda.CfnFunction(this, 'GreetFunction', {
      functionName: 'greet-handler',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      role: lambdaRole.attrArn,
      code: {
        zipFile: `
exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const name = body.name || 'desconocido';
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: \`¡Hola, \${name}! Saludos desde CDK L1.\` }),
  };
};`,
      },
    });

    // ─── 3. REST API ──────────────────────────────────────────────────────────
    const restApi = new apigateway.CfnRestApi(this, 'HelloRestApi', {
      name: 'HelloApi',
      description: 'API REST desplegada con constructores L1',
    });

    // ─── 4. Recurso /hello ────────────────────────────────────────────────────
    const helloResource = new apigateway.CfnResource(this, 'HelloResource', {
      restApiId: restApi.ref,
      parentId: restApi.attrRootResourceId,
      pathPart: 'hello',
    });

    // ─── 5. Método GET ────────────────────────────────────────────────────────
    const getMethod = new apigateway.CfnMethod(this, 'HelloGetMethod', {
      restApiId: restApi.ref,
      resourceId: helloResource.ref,
      httpMethod: 'GET',
      authorizationType: 'NONE',
      integration: {
        type: 'AWS_PROXY',
        integrationHttpMethod: 'POST',
        uri: cdk.Fn.join('', [
          'arn:aws:apigateway:', this.region,
          ':lambda:path/2015-03-31/functions/',
          helloFn.attrArn, '/invocations',
        ]),
      },
    });

    // ─── 6. Método PUT ────────────────────────────────────────────────────────
    const putMethod = new apigateway.CfnMethod(this, 'HelloPutMethod', {
      restApiId: restApi.ref,
      resourceId: helloResource.ref,
      httpMethod: 'PUT',
      authorizationType: 'NONE',
      integration: {
        type: 'AWS_PROXY',
        integrationHttpMethod: 'POST',
        uri: cdk.Fn.join('', [
          'arn:aws:apigateway:', this.region,
          ':lambda:path/2015-03-31/functions/',
          greetFn.attrArn, '/invocations',
        ]),
      },
    });

    // ─── 7. Permisos para que API Gateway invoque cada Lambda ─────────────────
    new lambda.CfnPermission(this, 'ApiGwPermissionGet', {
      action: 'lambda:InvokeFunction',
      functionName: helloFn.attrArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: cdk.Fn.join('', [
        'arn:aws:execute-api:', this.region, ':', this.account, ':',
        restApi.ref, '/*/GET/hello',
      ]),
    });

    new lambda.CfnPermission(this, 'ApiGwPermissionPut', {
      action: 'lambda:InvokeFunction',
      functionName: greetFn.attrArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: cdk.Fn.join('', [
        'arn:aws:execute-api:', this.region, ':', this.account, ':',
        restApi.ref, '/*/PUT/hello',
      ]),
    });

    // ─── 8. Deployment (depende de ambos métodos) ─────────────────────────────
    const deployment = new apigateway.CfnDeployment(this, 'HelloDeployment', {
      restApiId: restApi.ref,
    });
    deployment.addDependency(getMethod);
    deployment.addDependency(putMethod);

    // ─── 9. Stage "produc" ────────────────────────────────────────────────────
    new apigateway.CfnStage(this, 'ProducStage', {
      restApiId: restApi.ref,
      deploymentId: deployment.ref,
      stageName: 'produc',
    });

    // ─── 10. Outputs ──────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'GetEndpoint', {
      description: 'GET  → curl <URL>',
      value: cdk.Fn.join('', [
        'https://', restApi.ref, '.execute-api.', this.region,
        '.amazonaws.com/produc/hello',
      ]),
    });

    new cdk.CfnOutput(this, 'PutEndpoint', {
      description: 'PUT  → curl -X PUT <URL> -d \'{"name":"Tu Nombre"}\'',
      value: cdk.Fn.join('', [
        'https://', restApi.ref, '.execute-api.', this.region,
        '.amazonaws.com/produc/hello',
      ]),
    });
  }
}