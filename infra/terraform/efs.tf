resource "aws_security_group" "efs" {
  name        = "${local.name}-efs"
  description = "EFS mount targets — only reachable from ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "NFS from ECS tasks"
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-efs-sg" }
}

resource "aws_efs_file_system" "qdrant" {
  creation_token   = "${local.name}-qdrant"
  encrypted        = true
  kms_key_id       = aws_kms_key.main.arn
  performance_mode = "generalPurpose"
  throughput_mode  = "bursting"

  tags = { Name = "${local.name}-qdrant-storage" }
}

resource "aws_efs_mount_target" "qdrant" {
  count           = local.az_count
  file_system_id  = aws_efs_file_system.qdrant.id
  subnet_id       = aws_subnet.private[count.index].id
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_access_point" "qdrant" {
  file_system_id = aws_efs_file_system.qdrant.id

  posix_user {
    uid = 1000
    gid = 1000
  }

  root_directory {
    path = "/qdrant-storage"
    creation_info {
      owner_uid   = 1000
      owner_gid   = 1000
      permissions = "755"
    }
  }
}
