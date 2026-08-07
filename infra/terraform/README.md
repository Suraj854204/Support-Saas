# infra/terraform — AWS infrastructure

Provisions the production AWS environment: networking, ECS Fargate services,
managed data stores, and the GitHub Actions OIDC role that deploys to it.

## Architecture decision: ECS Fargate, not EKS

This stack deliberately uses **ECS Fargate + managed AWS services** (RDS,
DocumentDB, ElastiCache, MSK, OpenSearch) rather than self-hosting everything
on Kubernetes:

- No cluster control-plane, node group, or Kubernetes version to operate.
- Kafka/Elasticsearch/Mongo-compatible stores are managed (MSK/OpenSearch/
  DocumentDB) instead of Helm-charted onto a cluster you'd otherwise have to
  patch and upgrade yourself.
- Fargate bills per-task; there's no idle node capacity to right-size.

`infra/k8s/` (Kustomize manifests) is provided as an **alternative** for
teams that already run EKS or another cluster — it's a complete, validated
set of manifests, but it is not wired into `.github/workflows/cd.yml` and
this repo does not include an EKS Terraform module. Point `infra/k8s` at
your own cluster if you go that route; otherwise this directory (ECS) is
the supported path end-to-end, including CD.

## What's provisioned

| File | Resources |
|---|---|
| `vpc.tf` | VPC, public/private subnets across 2 AZs, NAT, flow logs |
| `security-groups.tf` | Least-privilege SGs between ALB/ECS tasks/data stores |
| `ecs.tf` | Cluster, task definitions, and services for api/web/ai-service/qdrant |
| `alb.tf` | Application Load Balancer, target groups, HTTP(S) listeners, path routing |
| `rds.tf` | PostgreSQL (Multi-AZ optional) |
| `docdb.tf` | DocumentDB (MongoDB-compatible) |
| `elasticache.tf` | Redis replication group |
| `opensearch.tf` | OpenSearch (Elasticsearch-compatible) domain |
| `msk.tf` | Managed Kafka (toggle off with `enable_msk = false`) |
| `efs.tf` | Persistent storage for Qdrant (Fargate has no local disk) |
| `ecr.tf` | Image repositories + lifecycle policies (keep last 20, expire untagged after 7 days) |
| `kms.tf` | Customer-managed key for ECR/Secrets Manager encryption |
| `secrets.tf` | Secrets Manager: JWT secrets **auto-generated** via `random_password`, plus your OpenAI key |
| `iam.tf` | ECS execution/task roles, scoped to exactly the secrets/logs they need |
| `service-discovery.tf` | Cloud Map namespace so `api`/`ai-service` reach internal-only `qdrant` by DNS |
| `dns.tf` | Route53 + ACM, only created if `domain_name` is set |
| `github-oidc.tf` | OIDC federation so CI/CD assumes an AWS role — **no static access keys anywhere** |

## Bootstrap (one-time, before the first `terraform apply`)

Remote state isn't configured by default (see the commented `backend "s3"`
block in `versions.tf`) — for anything beyond a single person experimenting,
create the state bucket/lock table first:

```bash
aws s3api create-bucket --bucket support-saas-terraform-state --region us-east-1
aws s3api put-bucket-versioning --bucket support-saas-terraform-state \
  --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name support-saas-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

Then uncomment the `backend "s3"` block in `versions.tf` and run
`terraform init` again to migrate state to it.

## Usage

```bash
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: at minimum set github_repository to your real repo

terraform init
terraform plan
terraform apply

# Wire up CD:
terraform output github_actions_role_arn
# -> set as the AWS_ROLE_ARN secret in GitHub (Settings > Secrets and variables > Actions)
# -> also set these as repo *variables* (not secrets):
#      AWS_REGION            = value of var.aws_region
#      ECS_CLUSTER_NAME      = terraform output ecs_cluster_name
#      ECR_REPOSITORY_PREFIX = "<project_name>-<environment>", e.g. "support-saas-production"
```

## Cost notes (so `terraform apply` doesn't surprise you)

The default `terraform.tfvars.example` is sized for a real but modest
production workload, not a demo. The biggest cost drivers, in order:

1. **MSK** (`enable_msk = true`) — a managed Kafka cluster runs whether or
   not you're using it. Set `enable_msk = false` for staging/dev and point
   `KAFKA_ENABLED=false` at the app level instead.
2. **OpenSearch** and **DocumentDB** — both bill per-node-hour regardless
   of traffic. Consider smaller instance types (`opensearch_instance_type`,
   and DocumentDB's instance count in `docdb.tf`) for non-production.
3. **NAT Gateway** (in `vpc.tf`) — a fixed hourly cost per AZ plus data
   processing charges; unavoidable for private-subnet egress but worth
   knowing about.
4. **RDS Multi-AZ** (`db_multi_az = true`) — doubles the database's cost
   for automatic failover. Turn off for non-production.

## Security notes

- Every data store lives in private subnets; only the ALB is internet-facing.
- Qdrant has no ALB target group at all — it's reachable only via internal
  Cloud Map DNS from `api`/`ai-service`, matching the app-level design where
  Qdrant is never exposed to the browser.
- JWT signing secrets are generated by Terraform (`random_password`), not
  hand-typed — they never exist outside Secrets Manager and your state file
  (which is why a remote, encrypted backend matters — see Bootstrap above).
- The GitHub OIDC trust policy restricts by repo (`github_repository` var);
  tighten the `sub` condition in `github-oidc.tf` to a specific branch/ref
  if you want only `main` (not every branch/PR) able to deploy.
