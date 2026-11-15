[CmdletBinding()]
param(
  [string]$EndpointUrl = "http://localhost:4566",
  [string]$CallbackUrl = "http://localhost:3000/api/auth/callback",
  [string]$LogoutUrl = "http://localhost:4200/",
  [string]$PoolName = "emil-ia-local",
  [string]$ClientName = "emil-ia-web",
  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$envPath = Join-Path $repoRoot ".env"
$EndpointUrl = $EndpointUrl.TrimEnd("/")

function Write-Stage([string]$Title) {
  Write-Host ""
  Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Get-EnvValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $envPath)) { return $null }
  $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -Last 1
  if ($null -eq $line) { return $null }
  return $line.Substring($Name.Length + 1)
}

function Set-EnvValue([string]$Name, [string]$Value) {
  if (-not (Test-Path -LiteralPath $envPath)) {
    New-Item -ItemType File -Path $envPath -Force | Out-Null
  }
  $lines = @(Get-Content -LiteralPath $envPath -ErrorAction SilentlyContinue)
  $escapedName = [regex]::Escape($Name)
  $kept = @($lines | Where-Object { $_ -notmatch "^$escapedName=" })
  Set-Content -LiteralPath $envPath -Value @($kept + "$Name=$Value") -Encoding UTF8
}

function Invoke-FlociAws([string[]]$Arguments) {
  $fullArguments = @($Arguments + @("--endpoint-url", $EndpointUrl, "--region", $Region))
  $output = & aws @fullArguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "AWS CLI failed: $($output -join [Environment]::NewLine)"
  }
  $text = ($output -join [Environment]::NewLine).Trim()
  if (-not $text) { return $null }
  return $text | ConvertFrom-Json
}

function New-SessionSecret {
  $bytes = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes)
}

Write-Stage "1/5 Verificar Floci y AWS CLI"
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "No se encontró AWS CLI. Instálalo y vuelve a ejecutar este script."
}
try {
  Invoke-WebRequest -UseBasicParsing -Uri "$EndpointUrl/" -TimeoutSec 5 | Out-Null
} catch {
  throw "Floci no responde en $EndpointUrl. Levanta el runtime antes de continuar."
}
if (-not $env:AWS_ACCESS_KEY_ID) { $env:AWS_ACCESS_KEY_ID = "test" }
if (-not $env:AWS_SECRET_ACCESS_KEY) { $env:AWS_SECRET_ACCESS_KEY = "test" }
$env:AWS_DEFAULT_REGION = $Region
Write-Host "Floci responde en $EndpointUrl." -ForegroundColor Green

Write-Stage "2/5 Crear o reutilizar el user pool"
$poolResult = Invoke-FlociAws @("cognito-idp", "list-user-pools", "--max-results", "60")
$pool = @($poolResult.UserPools) | Where-Object { $_.Name -eq $PoolName } | Select-Object -First 1
if ($null -eq $pool) {
  $pool = (Invoke-FlociAws @("cognito-idp", "create-user-pool", "--pool-name", $PoolName)).UserPool
  Write-Host "User pool creado: $($pool.Id)" -ForegroundColor Green
} else {
  Write-Host "User pool reutilizado: $($pool.Id)" -ForegroundColor Yellow
}
$poolId = $pool.Id
if (-not $poolId) { throw "Floci no devolvió el ID del user pool." }

Write-Stage "3/5 Crear o actualizar el cliente público PKCE"
$clientList = Invoke-FlociAws @("cognito-idp", "list-user-pool-clients", "--user-pool-id", $poolId)
$client = @($clientList.UserPoolClients) | Where-Object { $_.ClientName -eq $ClientName } | Select-Object -First 1
$clientArguments = @(
  "cognito-idp",
  $(if ($null -eq $client) { "create-user-pool-client" } else { "update-user-pool-client" }),
  "--user-pool-id", $poolId,
  "--client-name", $ClientName,
  "--no-generate-secret",
  "--explicit-auth-flows", "ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH",
  "--allowed-o-auth-flows-user-pool-client",
  "--allowed-o-auth-flows", "code",
  "--allowed-o-auth-scopes", "openid", "email",
  "--callback-urls", $CallbackUrl,
  "--logout-urls", $LogoutUrl,
  "--supported-identity-providers", "COGNITO"
)
if ($null -ne $client) { $clientArguments += @("--client-id", $client.ClientId) }
$clientResult = Invoke-FlociAws $clientArguments
$clientId = if ($null -eq $client) { $clientResult.UserPoolClient.ClientId } else { $client.ClientId }
if (-not $clientId) { throw "Floci no devolvió el ID del cliente." }
Write-Host "Cliente público PKCE listo: $clientId" -ForegroundColor Green

Write-Stage "4/5 Provisionar opcionalmente el primer estudiante"
$username = Read-Host "Usuario del primer estudiante (vacío para omitir)"
if ($username) {
  $users = Invoke-FlociAws @("cognito-idp", "list-users", "--user-pool-id", $poolId)
  $existing = @($users.Users) | Where-Object { $_.Username -eq $username } | Select-Object -First 1
  if ($null -eq $existing) {
    $securePassword = Read-Host "Contraseña temporal del estudiante" -AsSecureString
    $plainPassword = [System.Net.NetworkCredential]::new("", $securePassword).Password
    try {
      Invoke-FlociAws @("cognito-idp", "admin-create-user", "--user-pool-id", $poolId, "--username", $username, "--temporary-password", $plainPassword, "--message-action", "SUPPRESS") | Out-Null
      Invoke-FlociAws @("cognito-idp", "admin-set-user-password", "--user-pool-id", $poolId, "--username", $username, "--password", $plainPassword, "--permanent") | Out-Null
    } finally {
      $plainPassword = $null
    }
    Write-Host "Estudiante provisionado: $username" -ForegroundColor Green
  } else {
    Write-Host "Estudiante ya existente: $username" -ForegroundColor Yellow
  }
} else {
  Write-Host "Se omitió el primer estudiante; puedes crear cuentas con el mismo flujo administrativo." -ForegroundColor Yellow
}

Write-Stage "5/5 Escribir configuración local"
$existingSecret = Get-EnvValue "AUTH_SESSION_SECRET"
$sessionSecret = if ($existingSecret) { $existingSecret } else { New-SessionSecret }
$issuer = "$EndpointUrl/$poolId"
Set-EnvValue "AUTH_ISSUER" $issuer
Set-EnvValue "AUTH_CLIENT_ID" $clientId
Set-EnvValue "AUTH_REDIRECT_URI" $CallbackUrl
Set-EnvValue "AUTH_LOGOUT_URI" $LogoutUrl
Set-EnvValue "AUTH_SESSION_SECRET" $sessionSecret
Set-EnvValue "AUTH_COOKIE_NAME" "emilia_session"
Set-EnvValue "AUTH_COOKIE_SECURE" "false"
Set-EnvValue "AUTH_SESSION_IDLE_DAYS" "7"
Set-EnvValue "AUTH_SESSION_ABSOLUTE_DAYS" "30"
Set-EnvValue "AUTH_LOGIN_STATE_TTL_SECONDS" "600"
Set-EnvValue "AUTH_ALLOWED_ORIGIN" "http://localhost:4200"

Write-Host ""
Write-Host "Configuración local lista en .env (ignorado por git)." -ForegroundColor Green
Write-Host "AUTH_ISSUER=$issuer"
Write-Host "AUTH_CLIENT_ID=$clientId"
Write-Host "AUTH_REDIRECT_URI=$CallbackUrl"
Write-Host "AUTH_LOGOUT_URI=$LogoutUrl"
Write-Host "AUTH_SESSION_SECRET quedó escrito en .env; no se imprime." -ForegroundColor Yellow
Write-Host "Flujo siguiente: inicia API y web, abre http://localhost:4200 y entra con el estudiante provisionado."
