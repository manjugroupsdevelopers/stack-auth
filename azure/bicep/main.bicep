// Stack Auth Azure Infrastructure as Code (Bicep)
// Deploy with: az deployment group create --resource-group manjuwellness-auth --template-file main.bicep --parameters main.parameters.json

@description('Location for all resources')
param location string = 'centralindia'

@description('Container Registry name')
param acrName string = 'stackauthreg${uniqueString(resourceGroup().id)}'

@description('PostgreSQL server name')
param postgresServerName string = 'stackauthdb${uniqueString(resourceGroup().id)}'

@description('PostgreSQL admin username')
param postgresAdminUser string = 'stackadmin'

@description('PostgreSQL admin password')
@secure()
param postgresAdminPassword string

@description('Stack server secret for JWT encryption')
@secure()
param stackServerSecret string

@description('Freestyle API key for emails (optional)')
@secure()
param freestyleApiKey string = 'not-configured'

@description('Sandbox API token for self-hosted JS execution')
@secure()
param sandboxApiToken string = 'not-configured'

@description('JS execution engine mode for backend')
param jsExecutionEngine string = 'legacy'

@description('Internal sandbox API URL reachable by backend')
param sandboxApiUrl string = 'http://sandbox-api.stack-auth-sandbox.svc.cluster.local:8080'

@description('Admin email for initial user')
param adminEmail string = 'admin@manjuwellness.com'

@description('Admin password for initial user')
@secure()
param adminPassword string

@description('Container Apps Environment name')
param containerEnvName string = 'stack-auth-env'

// Container Registry
resource acr 'Microsoft.ContainerRegistry/registries@2023-01-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// PostgreSQL Flexible Server
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-03-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 30
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

// PostgreSQL Database
resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-03-01-preview' = {
  parent: postgresServer
  name: 'stackframe'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// PostgreSQL Firewall Rule (Allow Azure Services)
resource postgresFirewallRule 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-03-01-preview' = {
  parent: postgresServer
  name: 'AllowAllAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Log Analytics Workspace for Container Apps
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${containerEnvName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Container Apps Environment
resource containerEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Backend Container App
resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'stack-auth-backend'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8102
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'db-connection-string'
          value: 'postgresql://${postgresAdminUser}:${postgresAdminPassword}@${postgresServer.properties.fullyQualifiedDomainName}:5432/stackframe?sslmode=require'
        }
        {
          name: 'stack-server-secret'
          value: stackServerSecret
        }
        {
          name: 'freestyle-api-key'
          value: freestyleApiKey
        }
        {
          name: 'sandbox-api-token'
          value: sandboxApiToken
        }
        {
          name: 'admin-password'
          value: adminPassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'stack-auth-backend'
          image: '${acr.properties.loginServer}/stackauth/server:latest'
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'STACK_DATABASE_CONNECTION_STRING'
              secretRef: 'db-connection-string'
            }
            {
              name: 'STACK_SERVER_SECRET'
              secretRef: 'stack-server-secret'
            }
            {
              name: 'STACK_FREESTYLE_API_KEY'
              secretRef: 'freestyle-api-key'
            }
            {
              name: 'STACK_JS_EXECUTION_ENGINE'
              value: jsExecutionEngine
            }
            {
              name: 'STACK_SANDBOX_API_URL'
              value: sandboxApiUrl
            }
            {
              name: 'STACK_SANDBOX_API_TOKEN'
              secretRef: 'sandbox-api-token'
            }
            {
              name: 'STACK_SANDBOX_TIMEOUT_MS'
              value: '30000'
            }
            {
              name: 'STACK_SANDBOX_ALLOWED_MODULES'
              value: 'react@19.1.1,react-dom@19.1.1,@react-email/components@1.0.6,arktype@2.1.20'
            }
            {
              name: 'STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED'
              value: 'true'
            }
            {
              name: 'STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST'
              value: 'false'
            }
            {
              name: 'STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED'
              value: 'true'
            }
            {
              name: 'STACK_SEED_INTERNAL_PROJECT_USER_EMAIL'
              value: adminEmail
            }
            {
              name: 'STACK_SEED_INTERNAL_PROJECT_USER_PASSWORD'
              secretRef: 'admin-password'
            }
            {
              name: 'STACK_SEED_INTERNAL_PROJECT_USER_INTERNAL_ACCESS'
              value: 'true'
            }
            {
              name: 'NEXT_PUBLIC_STACK_DASHBOARD_URL'
              value: 'https://${dashboardApp.properties.configuration.ingress.fqdn}'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// Dashboard Container App
resource dashboardApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'stack-auth-dashboard'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8101
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'db-connection-string'
          value: 'postgresql://${postgresAdminUser}:${postgresAdminPassword}@${postgresServer.properties.fullyQualifiedDomainName}:5432/stackframe?sslmode=require'
        }
        {
          name: 'stack-server-secret'
          value: stackServerSecret
        }
        {
          name: 'freestyle-api-key'
          value: freestyleApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'stack-auth-dashboard'
          image: '${acr.properties.loginServer}/stackauth/server:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'STACK_DATABASE_CONNECTION_STRING'
              secretRef: 'db-connection-string'
            }
            {
              name: 'STACK_SERVER_SECRET'
              secretRef: 'stack-server-secret'
            }
            {
              name: 'STACK_FREESTYLE_API_KEY'
              secretRef: 'freestyle-api-key'
            }
            {
              name: 'NEXT_PUBLIC_STACK_API_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED'
              value: 'true'
            }
            {
              name: 'STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST'
              value: 'false'
            }
            {
              name: 'STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED'
              value: 'true'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// Outputs
output acrLoginServer string = acr.properties.loginServer
output postgresServerFqdn string = postgresServer.properties.fullyQualifiedDomainName
output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output dashboardUrl string = 'https://${dashboardApp.properties.configuration.ingress.fqdn}'
output containerEnvId string = containerEnv.id
