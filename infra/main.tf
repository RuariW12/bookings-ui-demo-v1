# Test-account infra: networking, IAM, DB secret in SSM, and the EC2 instance.
# Scoped to what the test account can prove: EC2 boots, Docker builds, the stack
# comes up over plain HTTP on the Elastic IP. No domain -> no Let's Encrypt/443.
# No Entra/ServiceNow/Power Automate on this account -> those params are omitted.

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

# ── SSM parameters (the one secret worth proving injection with) ──────────────

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${var.app_name}/db_password"
  type  = "SecureString"
  value = random_password.db.result
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

  # Boot must not run before the SSM read policy is attached or the param exists.
  depends_on = [
    aws_iam_role_policy.read_params,
    aws_iam_role_policy_attachment.ssm_core,
    aws_ssm_parameter.db_password,
  ]

  user_data = <<EOT
#!/bin/bash
set -euo pipefail

dnf update -y
dnf install -y docker git

# aws CLI: prefer preinstalled, fall back to package, then official bundle.
if ! command -v aws >/dev/null 2>&1; then
  dnf install -y awscli-2 || dnf install -y awscli || {
    dnf install -y unzip
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscli.zip
    unzip -q /tmp/awscli.zip -d /tmp
    /tmp/aws/install
  }
fi

# Compose plugin (arch-aware: uname -m -> x86_64 / aarch64).
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
systemctl enable --now docker

APP_DIR=/opt/bookings
mkdir -p "$APP_DIR"
git clone --branch "${var.git_branch}" --depth 1 "${var.repo_url}" "$APP_DIR/src"

get() {
  aws ssm get-parameter --name "$1" --with-decryption --query 'Parameter.Value' --output text --region "${var.aws_region}"
}

# http:// DOMAIN makes Caddy serve plain HTTP (no ACME), same as the local .env.
cat > "$APP_DIR/src/.env" <<ENV
DOMAIN=http://${aws_eip.app.public_ip}
POSTGRES_USER=bookings_admin
POSTGRES_DB=${var.db_name}
POSTGRES_PASSWORD=$(get "/${var.app_name}/db_password")
VITE_ENTRA_CLIENT_ID=UNSET
VITE_ENTRA_TENANT_ID=UNSET
VITE_REDIRECT_URI=http://${aws_eip.app.public_ip}/
ENV
chmod 600 "$APP_DIR/src/.env"

cd "$APP_DIR/src"
docker compose up -d --build
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
