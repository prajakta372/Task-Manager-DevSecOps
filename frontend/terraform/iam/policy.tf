resource "aws_iam_policy" "terraform_policy" {
  name        = "TaskManager-Terraform-Policy"
  description = "Least privilege policy for Task Manager DevOps project"

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [

      {
        Sid = "EC2Permissions"

        Effect = "Allow"

        Action = [
          "ec2:RunInstances",
          "ec2:TerminateInstances",
          "ec2:StartInstances",
          "ec2:StopInstances",
          "ec2:Describe*",
          "ec2:CreateTags"
        ]

        Resource = "*"
      },

      {
        Sid = "Networking"

        Effect = "Allow"

        Action = [
          "ec2:CreateVpc",
          "ec2:DeleteVpc",
          "ec2:DescribeVpcs",

          "ec2:CreateSubnet",
          "ec2:DeleteSubnet",
          "ec2:DescribeSubnets",

          "ec2:CreateInternetGateway",
          "ec2:AttachInternetGateway",
          "ec2:DetachInternetGateway",

          "ec2:CreateRouteTable",
          "ec2:DeleteRouteTable",
          "ec2:AssociateRouteTable",
          "ec2:CreateRoute",

          "ec2:CreateSecurityGroup",
          "ec2:DeleteSecurityGroup",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupIngress",

          "ec2:AllocateAddress",
          "ec2:AssociateAddress",
          "ec2:ReleaseAddress"
        ]

        Resource = "*"
      },

      {
        Sid = "IAM"

        Effect = "Allow"

        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PassRole"
        ]

        Resource = "*"
      },

      {
        Sid = "SNS"

        Effect = "Allow"

        Action = [
          "sns:CreateTopic",
          "sns:DeleteTopic",
          "sns:Publish",
          "sns:Subscribe"
        ]

        Resource = "*"
      },

      {
        Sid = "Route53"

        Effect = "Allow"

        Action = [
          "route53:CreateHostedZone",
          "route53:DeleteHostedZone",
          "route53:ChangeResourceRecordSets",
          "route53:GetHostedZone",
          "route53:ListHostedZones"
        ]

        Resource = "*"
      },

      {
        Sid = "CloudWatch"

        Effect = "Allow"

        Action = [
          "cloudwatch:PutMetricData",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]

        Resource = "*"
      },

      {
        Sid = "S3"

        Effect = "Allow"

        Action = [
          "s3:CreateBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]

        Resource = "*"
      }
    ]
  })
}