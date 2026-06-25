infra/

Terraform for AWS deployment of the parallel build tool for Strategy. 

- One EC2 instance running a docker compose stack (caddy serving the SPA with auto-HTTPS, plus a postgres instance)
- Box builds the image from the public repo and reads its secrets from SSM param store.

Files
- main.tf : holds sg's, elastic ip, instance role, SSM params, EC2 instance
- variables.tf :  inputs (VPC, subnet, domain, repo, etc.)
- providers.tf : AWS and other providers
- outputs.tf : public IP, ap URL, Session Manager command

Need AWS Credentials 
Need an existing VPC and public subnet
Need a DNS
Need to make app repo public with no exposed security holes (no hardcoded credentials)

