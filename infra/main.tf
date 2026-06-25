# Consolidated infra: networking, IAM, SSM parameters, and the EC2 instance.

data "aws_caller_identity" "current" {}

# ── Networking ───────────────────────────────────────────────────────────────

resource "aws_security_group" "app" {
  name        = "${var.app_name}-web"
  description = "Public web access for the bookings app"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP (ACME challenge + redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

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

# ── SSM parameters (runtime config + secrets) ────────────────────────────────

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${var.app_name}/db_password"
  type  = "SecureString"
  value = random_password.db.result
}

resource "aws_ssm_parameter" "entra_client_id" {
  name  = "/${var.app_name}/entra_client_id"
  type  = "String"
  value = var.entra_client_id == "" ? "UNSET" : var.entra_client_id
}

resource "aws_ssm_parameter" "entra_tenant_id" {
  name  = "/${var.app_name}/entra_tenant_id"
  type  = "String"
  value = var.entra_tenant_id == "" ? "UNSET" : var.entra_tenant_id
}

resource "aws_ssm_parameter" "entra_redirect_uri" {
  name  = "/${var.app_name}/entra_redirect_uri"
  type  = "String"
  value = var.entra_redirect_uri == "" ? "https://${var.domain_name}/" : var.entra_redirect_uri
}

resource "aws_ssm_parameter" "servicenow" {
  name  = "/${var.app_name}/servicenow"
  type  = "SecureString"
  value = "SET_OUT_OF_BAND"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "power_automate" {
  name  = "/${var.app_name}/power_automate"
  type  = "SecureString"
  value = "SET_OUT_OF_BAND"

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
    values = ["al2023-ami-2023.*-x86_64"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = var.public_subnet_id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  # Bootstrap (formerly user_data.sh.tftpl, now inline). Comment out to boot a
  # bare instance that doesn't self-configure.
  # Bootstrap (formerly user_data.sh.tftpl, now inline). Comment out to boot a
  # bare instance that doesn't self-configure.
  user_data = <<EOT
#!/bin/bash
set -euo pipefail

dnf update -y
dnf install -y docker git awscli

mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
systemctl enable --now docker

APP_DIR=/opt/bookings
mkdir -p "$APP_DIR"
git clone --branch "${var.git_branch}" --depth 1 "${var.repo_url}" "$APP_DIR/src"

get() {
  aws ssm get-parameter --name "$1" --with-decryption --query 'Parameter.Value' --output text --region "${var.aws_region}"
}

cat > "$APP_DIR/src/.env" <<ENV
DOMAIN=${var.domain_name}
ACME_EMAIL=${var.acme_email}
POSTGRES_USER=bookings_admin
POSTGRES_DB=${var.db_name}
POSTGRES_PASSWORD=$(get "/${var.app_name}/db_password")
VITE_ENTRA_CLIENT_ID=$(get "/${var.app_name}/entra_client_id")
VITE_ENTRA_TENANT_ID=$(get "/${var.app_name}/entra_tenant_id")
VITE_REDIRECT_URI=$(get "/${var.app_name}/entra_redirect_uri")
SERVICENOW_CREDS=$(get "/${var.app_name}/servicenow")
POWER_AUTOMATE=$(get "/${var.app_name}/power_automate")
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
