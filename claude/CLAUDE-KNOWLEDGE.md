# CLAUDE KNOWLEDGE

## Q: What is already available in this repo's AKS setup for HTTPS ingress?
A: `ingress-nginx` and `cert-manager` are installed in-cluster, and a `ClusterIssuer` named `letsencrypt-prod` exists and is `Ready`. New hostnames can be routed by creating an `Ingress` with `ingressClassName: nginx` and annotation `cert-manager.io/cluster-issuer: letsencrypt-prod`.
