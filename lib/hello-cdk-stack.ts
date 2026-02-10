import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /*Crear constructor de nivel 1 (L1)
    
    -------------------------------------------------------------------------------
    new cdk.aws_s3.CfnBucket(this, 'MyFirstBucketFFT', {
      bucketName: 'my-first-bucket-fft'
    })
   -------------------------------------------------------------------------------

    Crear constructor de nivel 2 (L2)

    -------------------------------------------------------------------------------
    const bucket = new cdk.aws_s3.Bucket(this, 'MyFirstBucketFFT2', {
      bucketName: 'my-first-bucket-fft2'
    })
    new cdk.aws_s3_deployment.BucketDeployment(this, 'DeployWithInvalidation', {
      sources: [cdk.aws_s3_deployment.Source.asset('./files')],
      destinationBucket: bucket,
    })
    -------------------------------------------------------------------------------
    */
  }

}
