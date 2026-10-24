# infra/k8s — Kubernetes manifests (alternative deployment path)

**This is not the primary deployment path.** `infra/terraform` provisions
ECS Fargate + managed AWS services, and `.github/workflows/cd.yml` deploys
there. This directory is a complete, independently-validated alternative for
teams that already run a Kubernetes cluster (EKS or otherwise) and would
rather deploy this app there instead. No Terraform module for provisioning
an EKS cluster is included — bring your own cluster.

## Structure

```
base/
├── namespace.yaml
├── configmap.yaml           # non-sensitive config
├── secrets.yaml             # TEMPLATE ONLY — see the warning in the file
├── api-deployment.yaml      # api Deployment + Service
├── web-deployment.yaml      # web Deployment + Service
├── ai-service-deployment.yaml
├── ingress.yaml             # nginx-ingress + cert-manager
├── hpa.yaml                 # autoscaling for all three services
├── migration-job.yaml       # one-shot `prisma migrate deploy`
└── kustomization.yaml
overlays/
├── staging/        # 1 replica each, staging hostnames
└── production/     # base replica counts (2+), production hostnames
```

Postgres/MongoDB/Redis/Elasticsearch/Qdrant/Kafka themselves aren't defined
here — run them as managed services (RDS, DocumentDB, ElastiCache,
OpenSearch, MSK, or a hosted Qdrant) and point the ConfigMap/Secret at their
endpoints, the same way `infra/terraform` does. Self-hosting them on the
same cluster (Strimzi for Kafka, the Elastic operator, etc.) is a reasonable
choice too, but is out of scope for these manifests.

## Usage

```bash
# Fill in real values — secrets.yaml is a template; see its header comment
# for why you should NOT edit it in place for a real deployment.
kubectl create secret generic support-saas-secrets \
  --namespace support-saas \
  --from-literal=DATABASE_URL=... \
  --from-literal=MONGO_URL=... \
  --from-literal=REDIS_URL=... \
  --from-literal=JWT_ACCESS_SECRET=... \
  --from-literal=JWT_REFRESH_SECRET=... \
  --from-literal=WIDGET_JWT_SECRET=... \
  --from-literal=GOOGLE_API_KEY=...

# Point the image tags at your registry, then:
kubectl apply -k overlays/production
kubectl apply -f base/migration-job.yaml
kubectl rollout status deployment/api -n support-saas
```

## Verified

Since `terraform`/`kubectl`/`kustomize` binaries weren't installable in the
build sandbox (their release artifacts are hosted on domains outside the
sandbox's network allowlist), every manifest here was instead validated
with a structural cross-reference script — parsing all YAML and asserting:
Service selectors match their Deployment's pod labels, Service `targetPort`
values exist among the Deployment's `containerPort`s, HPA `scaleTargetRef`s
point at real Deployments, Ingress backends point at real Services on ports
they actually expose, `envFrom` `configMapRef`/`secretRef` names resolve,
and every `kustomization.yaml` resource/patch target resolves to a file or
resource that exists. All checks passed. Run an actual `kubectl apply
--dry-run=server` against a real cluster before trusting this in production
— structural validation catches wiring mistakes, not everything a live API
server's admission controllers would.
