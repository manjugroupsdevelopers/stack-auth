# Stack Auth Azure Infrastructure - Terraform Configuration

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

# Variables
variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "centralindia"
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
  default     = "manjuwellness-auth"
}

variable "postgres_admin_password" {
  description = "PostgreSQL admin password"
  type        = string
  sensitive   = true
}

variable "stack_server_secret" {
  description = "Stack server secret for JWT encryption"
  type        = string
  sensitive   = true
}

variable "freestyle_api_key" {
  description = "Freestyle API key for emails"
  type        = string
  default     = "not-configured"
  sensitive   = true
}

variable "admin_email" {
  description = "Admin email for initial user"
  type        = string
  default     = "admin@manjuwellness.com"
}

variable "admin_password" {
  description = "Admin password for initial user"
  type        = string
  sensitive   = true
}

# Random suffix for unique names
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
}

# Container Registry
resource "azurerm_container_registry" "acr" {
  name                = "stackauthreg${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = true
}

# PostgreSQL Flexible Server
resource "azurerm_postgresql_flexible_server" "postgres" {
  name                   = "stackauthdb${random_string.suffix.result}"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "16"
  administrator_login    = "stackadmin"
  administrator_password = var.postgres_admin_password
  
  storage_mb = 131072  # 128GB
  
  sku_name = "GP_Standard_D4s_v3"  # 4 vCores, 16GB RAM
  
  backup_retention_days        = 30
  geo_redundant_backup_enabled = false
  
  # High availability (optional, uncomment for production HA)
  # high_availability {
  #   mode = "ZoneRedundant"
  # }
}

# PostgreSQL Database
resource "azurerm_postgresql_flexible_server_database" "stackframe" {
  name      = "stackframe"
  server_id = azurerm_postgresql_flexible_server.postgres.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# PostgreSQL Firewall Rule
resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure" {
  name             = "AllowAllAzureIps"
  server_id        = azurerm_postgresql_flexible_server.postgres.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "logs" {
  name                = "stack-auth-logs"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

# Container Apps Environment
resource "azurerm_container_app_environment" "env" {
  name                       = "stack-auth-env"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
}

# Backend Container App
resource "azurerm_container_app" "backend" {
  name                         = "stack-auth-backend"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  registry {
    server               = azurerm_container_registry.acr.login_server
    username             = azurerm_container_registry.acr.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.acr.admin_password
  }

  secret {
    name  = "db-connection-string"
    value = "postgresql://stackadmin:${var.postgres_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/stackframe?sslmode=require"
  }

  secret {
    name  = "stack-server-secret"
    value = var.stack_server_secret
  }

  secret {
    name  = "freestyle-api-key"
    value = var.freestyle_api_key
  }

  secret {
    name  = "admin-password"
    value = var.admin_password
  }

  template {
    container {
      name   = "stack-auth-backend"
      image  = "${azurerm_container_registry.acr.login_server}/stackauth/server:latest"
      cpu    = 4.0
      memory = "8Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name        = "STACK_DATABASE_CONNECTION_STRING"
        secret_name = "db-connection-string"
      }

      env {
        name        = "STACK_SERVER_SECRET"
        secret_name = "stack-server-secret"
      }

      env {
        name        = "STACK_FREESTYLE_API_KEY"
        secret_name = "freestyle-api-key"
      }

      env {
        name  = "STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED"
        value = "true"
      }

      env {
        name  = "STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST"
        value = "false"
      }

      env {
        name  = "STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED"
        value = "true"
      }

      env {
        name  = "STACK_SEED_INTERNAL_PROJECT_USER_EMAIL"
        value = var.admin_email
      }

      env {
        name        = "STACK_SEED_INTERNAL_PROJECT_USER_PASSWORD"
        secret_name = "admin-password"
      }

      env {
        name  = "STACK_SEED_INTERNAL_PROJECT_USER_INTERNAL_ACCESS"
        value = "true"
      }

      env {
        name  = "NEXT_PUBLIC_STACK_DASHBOARD_URL"
        value = "https://${azurerm_container_app.dashboard.ingress[0].fqdn}"
      }
    }

    min_replicas = 2
    max_replicas = 10
  }

  ingress {
    external_enabled = true
    target_port      = 8102
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

# Dashboard Container App
resource "azurerm_container_app" "dashboard" {
  name                         = "stack-auth-dashboard"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  registry {
    server               = azurerm_container_registry.acr.login_server
    username             = azurerm_container_registry.acr.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.acr.admin_password
  }

  secret {
    name  = "db-connection-string"
    value = "postgresql://stackadmin:${var.postgres_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/stackframe?sslmode=require"
  }

  secret {
    name  = "stack-server-secret"
    value = var.stack_server_secret
  }

  secret {
    name  = "freestyle-api-key"
    value = var.freestyle_api_key
  }

  template {
    container {
      name   = "stack-auth-dashboard"
      image  = "${azurerm_container_registry.acr.login_server}/stackauth/server:latest"
      cpu    = 2.0
      memory = "4Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name        = "STACK_DATABASE_CONNECTION_STRING"
        secret_name = "db-connection-string"
      }

      env {
        name        = "STACK_SERVER_SECRET"
        secret_name = "stack-server-secret"
      }

      env {
        name        = "STACK_FREESTYLE_API_KEY"
        secret_name = "freestyle-api-key"
      }

      env {
        name  = "NEXT_PUBLIC_STACK_API_URL"
        value = "https://${azurerm_container_app.backend.ingress[0].fqdn}"
      }

      env {
        name  = "STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED"
        value = "true"
      }

      env {
        name  = "STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST"
        value = "false"
      }

      env {
        name  = "STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED"
        value = "true"
      }
    }

    min_replicas = 2
    max_replicas = 5
  }

  ingress {
    external_enabled = true
    target_port      = 8101
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

# Outputs
output "acr_login_server" {
  value = azurerm_container_registry.acr.login_server
}

output "postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.postgres.fqdn
}

output "backend_url" {
  value = "https://${azurerm_container_app.backend.ingress[0].fqdn}"
}

output "dashboard_url" {
  value = "https://${azurerm_container_app.dashboard.ingress[0].fqdn}"
}

output "resource_group_name" {
  value = azurerm_resource_group.main.name
}
