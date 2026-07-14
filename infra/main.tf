# Test-account infra, hardened for reproducible bootstrap.
# Scoped to what the test account can prove: EC2 boots, Docker builds on ARM, the
# stack comes up over plain HTTP on the Elastic IP. No domain -> no Let's Encrypt/443.
# github_token + userconfig_js SSM params are prod-readiness scaffolding: inert
# ("UNSET") on the test account, set out-of-band for prod.

data "aws_caller_identity" "current" {}

locals {
  # Graviton (t4g/*g) instances need arm64; everything else x86_64.
  cpu_arch = can(regex("^[a-z]+[0-9]+g\\.", var.instance_type)) ? "arm64" : "x86_64"
}

# ── Networking ───────────────────────────────────────────────────────────────

resource "aws_security_group" "app" {
  name        = "${var.app_name}-web"
  description = "Public web access for the bookings app (test: HTTP only)"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # 443 intentionally omitted for the test account: no domain, no trusted cert.
  # Add it at prod alongside the real domain + Let's Encrypt.

  dynamic "ingress" {
    for_each = var.ssh_ingress_cidr == "" ? [] : [var.ssh_ingress_cidr]
    content {
      description = "SSH"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    description = "All egress (git clone, image pulls, SSM, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_eip" "app" {
  domain = "vpc"
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}

# ── IAM: instance role (SSM read + Session Manager) ──────────────────────────

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${var.app_name}-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "read_params" {
  statement {
    sid       = "ReadAppParams"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.app_name}/*"]
  }

  statement {
    sid       = "DecryptSecureStrings"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "read_params" {
  name   = "${var.app_name}-read-params"
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.read_params.json
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.app_name}-instance"
  role = aws_iam_role.instance.name
}

# ── SSM parameters ───────────────────────────────────────────────────────────

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${var.app_name}/db_password"
  type  = "SecureString"
  value = random_password.db.result
}

# GitHub token for cloning a private repo. "UNSET" -> bootstrap does a plain
# clone (fine for the public test repo). Set out-of-band for a private prod repo.
resource "aws_ssm_parameter" "github_token" {
  name  = "/${var.app_name}/github_token"
  type  = "SecureString"
  value = "UNSET"
  lifecycle {
    ignore_changes = [value]
  }
}

# Full contents of bookings-ui/src/lib/userConfig.js (gitignored, real emails/
# regions). "UNSET" -> bootstrap keeps whatever the repo ships (the committed
# stub). Set out-of-band for prod so the real config never lives in the repo.
resource "aws_ssm_parameter" "userconfig_js" {
  name  = "/${var.app_name}/userconfig_js"
  type  = "SecureString"
  value = "UNSET"
  lifecycle {
    ignore_changes = [value]
  }
}

# ── EC2 instance ─────────────────────────────────────────────────────────────

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-${local.cpu_arch}"]
  }
  filter {
    name   = "architecture"
    values = [local.cpu_arch]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = var.public_subnet_id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  # Boot must not run before the SSM read policy is attached or the params exist.
  depends_on = [
    aws_iam_role_policy.read_params,
    aws_iam_role_policy_attachment.ssm_core,
    aws_ssm_parameter.db_password,
    aws_ssm_parameter.github_token,
    aws_ssm_parameter.userconfig_js,
  ]

  user_data = <<EOT
#!/bin/bash
set -euo pipefail

# Retry wrapper for network-fragile steps: a transient dnf/curl/git/SSM failure
# retries instead of killing the whole bootstrap.
retry() {
  local n=0 max=5 delay=5
  until "$@"; do
    n=$((n+1))
    if [ "$n" -ge "$max" ]; then
      echo "BOOTSTRAP FAILED after $max attempts: $*" >&2
      return 1
    fi
    echo "retry $n/$max: $* (sleep $delay)" >&2
    sleep "$delay"
  done
}

# uname -m gives aarch64/x86_64 (compose asset naming); Docker plugin releases
# use arm64/amd64 (Go arch naming). Map between them.
ARCH=$(uname -m)
case "$ARCH" in
  aarch64) DOCKER_ARCH=arm64 ;;
  x86_64)  DOCKER_ARCH=amd64 ;;
  *)       echo "unsupported arch: $ARCH" >&2; exit 1 ;;
esac

retry dnf update -y
retry dnf install -y docker git

# aws CLI: prefer preinstalled, fall back to package, then official bundle.
if ! command -v aws >/dev/null 2>&1; then
  dnf install -y awscli-2 || dnf install -y awscli || {
    retry dnf install -y unzip
    retry curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$ARCH.zip" -o /tmp/awscli.zip
    unzip -q /tmp/awscli.zip -d /tmp
    /tmp/aws/install
  }
fi

# Docker CLI plugins into a path that overrides the (older) package-bundled ones.
PLUGIN_DIR=/usr/local/lib/docker/cli-plugins
mkdir -p "$PLUGIN_DIR"

# Compose (latest; asset uses uname -m naming).
retry curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$ARCH" -o "$PLUGIN_DIR/docker-compose"
chmod +x "$PLUGIN_DIR/docker-compose"

# Buildx pinned: AL2023's package-bundled buildx is < 0.17.0, which "compose
# build" rejects. Asset name embeds the version, so this can't use latest/.
BUILDX_VERSION=v0.25.0
retry curl -fsSL "https://github.com/docker/buildx/releases/download/$BUILDX_VERSION/buildx-$BUILDX_VERSION.linux-$DOCKER_ARCH" -o "$PLUGIN_DIR/docker-buildx"
chmod +x "$PLUGIN_DIR/docker-buildx"

systemctl enable --now docker

get() {
  retry aws ssm get-parameter --name "$1" --with-decryption --query 'Parameter.Value' --output text --region "${var.aws_region}"
}

APP_DIR=/opt/bookings
mkdir -p "$APP_DIR"

# Token-gated clone: inject a token when one is set, else plain clone (public repo).
TOKEN=$(get "/${var.app_name}/github_token")
if [ "$TOKEN" != "UNSET" ] && [ -n "$TOKEN" ]; then
  CLONE_URL=$(echo "${var.repo_url}" | sed "s#https://#https://x-access-token:$TOKEN@#")
else
  CLONE_URL="${var.repo_url}"
fi
retry git clone --branch "${var.git_branch}" --depth 1 "$CLONE_URL" "$APP_DIR/src"

# Overwrite userConfig.js from SSM when provided; otherwise keep the repo's copy.
USERCONFIG=$(get "/${var.app_name}/userconfig_js")
if [ "$USERCONFIG" != "UNSET" ] && [ -n "$USERCONFIG" ]; then
  DEST="$APP_DIR/src/bookings-ui/src/lib/userConfig.js"
  mkdir -p "$(dirname "$DEST")"
  printf '%s' "$USERCONFIG" > "$DEST"
fi

# http:// DOMAIN makes Caddy serve plain HTTP (no ACME), same as the local .env.
# ACME_EMAIL kept as a harmless placeholder so compose doesn't warn.
cat > "$APP_DIR/src/.env" <<ENV
DOMAIN=http://${aws_eip.app.public_ip}
ACME_EMAIL=${var.acme_email}
POSTGRES_USER=bookings_admin
POSTGRES_DB=${var.db_name}
POSTGRES_PASSWORD=$(get "/${var.app_name}/db_password")
VITE_ENTRA_CLIENT_ID=UNSET
VITE_ENTRA_TENANT_ID=UNSET
VITE_REDIRECT_URI=http://${aws_eip.app.public_ip}/
ENV
chmod 600 "$APP_DIR/src/.env"

cd "$APP_DIR/src"
retry docker compose up -d --build
EOT

  user_data_replace_on_change = true

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }

  tags = { Name = var.app_name }
}