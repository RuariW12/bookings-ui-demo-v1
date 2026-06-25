output "public_ip" {
  description = "Elastic IP. Point the domain's DNS A record here."
  value       = aws_eip.app.public_ip
}

output "app_url" {
  description = "URL once DNS points at the IP and the cert is issued."
  value       = "https://${var.domain_name}/"
}

output "instance_id" {
  description = "EC2 instance ID."
  value       = aws_instance.app.id
}

output "session_manager_hint" {
  description = "Open a shell without SSH."
  value       = "aws ssm start-session --target ${aws_instance.app.id} --region ${var.aws_region}"
}
