import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cfn from 'aws-cdk-lib/core';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── 1. Tabla DynamoDB (L1) ───────────────────────────────────────────────
    const tabla = new dynamodb.CfnTable(this, 'ReservasTable', {
      tableName: 'reservas',
      billingMode: 'PAY_PER_REQUEST',
      attributeDefinitions: [
        {
          attributeName: 'reserva_id',   // Partition Key
          attributeType: 'S',
        },
      ],
      keySchema: [
        {
          attributeName: 'reserva_id',
          keyType: 'HASH',
        },
      ],
    });

    // ─── 2. IAM Role para la Lambda seed ─────────────────────────────────────
    const seedRole = new iam.CfnRole(this, 'SeedRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      ],
      policies: [
        {
          policyName: 'DynamoPutItem',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: ['dynamodb:PutItem'],
                Resource: tabla.attrArn,
              },
            ],
          },
        },
      ],
    });

    // ─── 3. Lambda seed con protocolo CFN Custom Resource completo ────────────
    const seedFn = new lambda.CfnFunction(this, 'SeedFunction', {
      functionName: 'reservas-seed',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      role: seedRole.attrArn,
      timeout: 30,
      code: {
        zipFile: `
const https  = require('https');
const url    = require('url');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({});

const items = [
  {
    reserva_id:     { S: 'RES-001' },
    fecha_inicio:   { S: '2025-06-01' },
    fecha_fin:      { S: '2025-06-07' },
    nombre_cliente: { S: 'Ana Garcia' },
  },
  {
    reserva_id:     { S: 'RES-002' },
    fecha_inicio:   { S: '2025-07-15' },
    fecha_fin:      { S: '2025-07-20' },
    nombre_cliente: { S: 'Carlos Lopez' },
  },
];

function sendResponse(event, status, reason) {
  const body = JSON.stringify({
    Status:             status,
    Reason:             reason || 'OK',
    PhysicalResourceId: 'reservas-seed',
    StackId:            event.StackId,
    RequestId:          event.RequestId,
    LogicalResourceId:  event.LogicalResourceId,
    Data:               {},
  });

  const parsed = url.parse(event.ResponseURL);
  const options = {
    hostname: parsed.hostname,
    port:     443,
    path:     parsed.path,
    method:   'PUT',
    headers:  { 'Content-Type': '', 'Content-Length': Buffer.byteLength(body) },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, resolve);
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  try {
    if (event.RequestType !== 'Delete') {
      for (const item of items) {
        await client.send(new PutItemCommand({
          TableName: process.env.TABLE_NAME,
          Item: item,
        }));
      }
    }
    await sendResponse(event, 'SUCCESS', 'Items insertados');
  } catch (err) {
    console.error(err);
    await sendResponse(event, 'FAILED', String(err));
  }
};`,
      },
      environment: {
        variables: { TABLE_NAME: 'reservas' },
      },
    });

    seedFn.addDependency(tabla);
    seedFn.addDependency(seedRole);

    // ─── 4. Permiso: CloudFormation puede invocar la Lambda ───────────────────
    const permission = new lambda.CfnPermission(this, 'SeedPermission', {
      action:       'lambda:InvokeFunction',
      functionName: seedFn.attrArn,
      principal:    'cloudformation.amazonaws.com',
    });
    permission.addDependency(seedFn);

    // ─── 5. CfnCustomResource (L1) — serviceToken = ARN de la Lambda ──────────
    const customResource = new cfn.CfnCustomResource(this, 'SeedCustomResource', {
      serviceToken: seedFn.attrArn,
    });
    customResource.addDependency(seedFn);
    customResource.addDependency(permission);

    // ─── 6. IAM Role para la Lambda de la API ────────────────────────────────
    const apiLambdaRole = new iam.CfnRole(this, 'ApiLambdaRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      ],
      policies: [
        {
          policyName: 'DynamoPutItemApi',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: ['dynamodb:PutItem'],
                Resource: tabla.attrArn,
              },
            ],
          },
        },
      ],
    });

    // ─── 7. Lambda para añadir reservas via API ───────────────────────────────
    const addReservaFn = new lambda.CfnFunction(this, 'AddReservaFunction', {
      functionName: 'reservas-add',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      role: apiLambdaRole.attrArn,
      timeout: 10,
      code: {
        zipFile: `
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const client = new DynamoDBClient({});

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');

    if (!body.reserva_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'reserva_id es obligatorio' }),
      };
    }

    const item = {
      reserva_id:     { S: body.reserva_id },
      fecha_inicio:   { S: body.fecha_inicio   || '' },
      fecha_fin:      { S: body.fecha_fin       || '' },
      nombre_cliente: { S: body.nombre_cliente  || '' },
    };

    await client.send(new PutItemCommand({
      TableName: process.env.TABLE_NAME,
      Item: item,
    }));

    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'Reserva creada', reserva_id: body.reserva_id }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err) }),
    };
  }
};`,
      },
      environment: {
        variables: { TABLE_NAME: 'reservas' },
      },
    });

    addReservaFn.addDependency(tabla);
    addReservaFn.addDependency(apiLambdaRole);

    // ─── 8. API Gateway REST API ──────────────────────────────────────────────
    const api = new apigateway.CfnRestApi(this, 'ReservasApi', {
      name: 'ReservasAPI',
      description: 'API para gestionar reservas',
    });

    // Recurso /reservas
    const reservasResource = new apigateway.CfnResource(this, 'ReservasResource', {
      restApiId: api.ref,
      parentId:  api.attrRootResourceId,
      pathPart:  'reservas',
    });

    // Método POST en /reservas
    const postMethod = new apigateway.CfnMethod(this, 'ReservasPost', {
      restApiId:         api.ref,
      resourceId:        reservasResource.ref,
      httpMethod:        'POST',
      authorizationType: 'NONE',
      integration: {
        type:                  'AWS_PROXY',
        integrationHttpMethod: 'POST',
        uri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${addReservaFn.attrArn}/invocations`,
      },
    });

    // Deployment (necesario para que el stage exista)
    const deployment = new apigateway.CfnDeployment(this, 'ReservasDeployment', {
      restApiId: api.ref,
    });
    deployment.addDependency(postMethod);

    // Stage prod
    const stage = new apigateway.CfnStage(this, 'ReservasStageProd', {
      restApiId:    api.ref,
      stageName:    'prod',
      deploymentId: deployment.ref,
    });

    // Permiso para que API Gateway invoque la Lambda
    const apiPermission = new lambda.CfnPermission(this, 'ApiGwPermission', {
      action:       'lambda:InvokeFunction',
      functionName: addReservaFn.attrArn,
      principal:    'apigateway.amazonaws.com',
      sourceArn:    `arn:aws:execute-api:${this.region}:${this.account}:${api.ref}/*/POST/reservas`,
    });

    // ─── 9. Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'TablaArn', {
      description: 'ARN de la tabla DynamoDB reservas',
      value: tabla.attrArn,
    });

    new cdk.CfnOutput(this, 'TablaName', {
      description: 'Escanea con: aws dynamodb scan --table-name reservas',
      value: 'reservas',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      description: 'Endpoint POST para añadir reservas',
      value: `https://${api.ref}.execute-api.${this.region}.amazonaws.com/prod/reservas`,
    });
  }
}