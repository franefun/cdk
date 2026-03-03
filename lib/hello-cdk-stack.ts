
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //Crear constructor de nivel 1 de un s3 (L1)
    
    //-------------------------------------------------------------------------------
    new cdk.aws_s3.CfnBucket(this, 'MyFirstBucketFFT', {
      bucketName: 'my-first-bucket-fft'
    })
   //-------------------------------------------------------------------------------

    //Crear constructor de nivel 2 de un s3 (L2)

    //-------------------------------------------------------------------------------
    const bucket = new cdk.aws_s3.Bucket(this, 'MyFirstBucketFFT2', {
      bucketName: 'my-first-bucket-fft2'
    })
    new cdk.aws_s3_deployment.BucketDeployment(this, 'DeployWithInvalidation', {
      sources: [cdk.aws_s3_deployment.Source.asset('./files')],
      destinationBucket: bucket,
    })
    //-------------------------------------------------------------------------------
    

    //Crear constructor de nivel 1 de un dynamo (L1)
    new cdk.aws_dynamodb.CfnTable(this, 'MyFirstTableFFT', {
      tableName: 'Fran',
      billingMode: 'PAY_PER_REQUEST',
      attributeDefinitions: [
        {
          attributeName: 'user',
          attributeType: 'S'
        }
      ],
      keySchema: [
        {
          attributeName: 'user',
          keyType: 'HASH'
        }
      ]

    })
    
    //Crear rol para funcion lambda
    const lambdaRole = new cdk.aws_iam.CfnRole(this, 'LambdaRoleFFT', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
          Action: 'sts:AssumeRole'
        }]
      },
      managedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
    })
    //Crear funcion lambda
    new cdk.aws_lambda.CfnFunction(this, 'MyLambdaFFT', {
      functionName: 'Fran',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      role: lambdaRole.attrArn,
      code: {
        zipFile: `
        exports.handler = async (event) => 
        { console.log("hello, world"); return 
        { statusCode: 200, body: JSON.stringify("hello from lambda") }; };`
      },
      timeout: 30
    })

    //Creo un rest api
    const api = new cdk.aws_apigateway.CfnRestApi(this, 'FranAPI', {
      name: 'FranAPI',

    })

    //creo el recurso hola
    const helloResource = new cdk.aws_apigateway.CfnResource(this, 'HelloResource', {
      restApiId: api.ref,
      parentId: api.attrRootResourceId,
      pathPart: 'hola',
    })

    //creo metodo para ese recurso
    const helloMethod = new cdk.aws_apigateway.CfnMethod(this, 'HelloMethod', {
       httpMethod: 'GET',
      resourceId: helloResource.ref,
      restApiId: api.ref,
      authorizationType: 'NONE',
      integration: {
        type: 'MOCK',
        requestTemplates: {
          'application/json': '{"statusCode": 200}',
        },
        integrationResponses: [
          {
            statusCode: '200',
            responseTemplates: {
              'application/json': '{"message": "Hello, World!"}',
            },
          },
        ],
      },
      methodResponses: [
        {
          statusCode: '200',
        },
      ],
    })

    //hago un deploy de la api
    const deployment = new cdk.aws_apigateway.CfnDeployment(this, 'Deployment', {
      restApiId: api.ref
    })
    deployment.addDependency(helloMethod)

    //crear un stage para la api
    const stage = new cdk.aws_apigateway.CfnStage(this, 'Stage', {
      restApiId: api.ref,
      stageName: 'produccion',
      deploymentId: deployment.ref
    })

    //output de la url
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `https://${api.ref}.execute-api.${this.region}.amazonaws.com/${stage.stageName}/hola`
    })
    
  }

}
