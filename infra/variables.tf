variable "aws_region" {
  description = "AWS region. US East matches the team's Eastern-Time anchor."
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Name prefix and SSM parameter path segment."
  type        = string
  default     = "bookings-ui"
}

# --- Networking: provided by the cloud team -----------------------------------

variable "vpc_id" {
  description = "Existing VPC the instance lives in."
  type        = string
}

variable "public_subnet_id" {
  description = "Public subnet (route to an internet gateway) for the instance."
  type        = string
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to SSH on port 22. Leave empty to keep 22 closed and use SSM Session Manager instead (recommended)."
  type        = string
  default     = ""
}

# --- Instance -----------------------------------------------------------------

variable "instance_type" {
  description = "EC2 size. t3.small (2 GB) so the in-container Vite build doesn't OOM."
  type        = string
  default     = "t3.small"
}

# --- App / deploy -------------------------------------------------------------

variable "domain_name" {
  description = "Hostname for the app, e.g. bookings.strategy.com. Caddy gets a Let's Encrypt cert for it."
  type        = string
}

variable "acme_email" {
  description = "Email for Let's Encrypt registration / expiry notices."
  type        = string
}

variable "repo_url" {
  description = "Public HTTPS Git URL the box clones to build the image."
  type        = string
  # example: "https://github.com/<org>/interface-v1.git"
}

variable "git_branch" {
  description = "Branch to deploy."
  type        = string
  default     = "main"
}

variable "db_name" {
  description = "Postgres database name."
  type        = string
  default     = "bookings"
}

# --- Entra (non-secret: client/tenant IDs ship in the browser bundle) ---------

variable "entra_client_id" {
  description = "Entra app registration client ID. Not a secret. Empty is fine until the app registration exists."
  type        = string
  default     = ""
}

variable "entra_tenant_id" {
  description = "Entra tenant ID. Not a secret."
  type        = string
  default     = ""
}

variable "entra_redirect_uri" {
  description = "OAuth redirect URI. Defaults to https://<domain>/ when left empty."
  type        = string
  default     = ""
}
