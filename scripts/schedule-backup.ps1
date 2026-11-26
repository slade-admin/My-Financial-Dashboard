[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidatePattern('^([01][0-9]|2[0-3]):[0-5][0-9]$')]
  [string]$Time = '20:00'
)

$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$node = (Get-Command node -ErrorAction Stop).Source
$tsx = Join-Path $project 'node_modules\tsx\dist\cli.mjs'
$script = Join-Path $PSScriptRoot 'backup.ts'
$digest = [System.Security.Cryptography.SHA256]::Create()
try {
  $hash = [BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::UTF8.GetBytes($project.ToLowerInvariant()))).Replace('-', '').Substring(0, 12)
} finally { $digest.Dispose() }
$taskName = "FinanceDashboardBackup-$hash"

Push-Location $project
try {
  & $node $tsx $script check
  if ($LASTEXITCODE -ne 0) { throw 'Backup configuration check failed. No scheduled task was registered.' }
} finally { Pop-Location }

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  throw "Task $taskName already exists. Inspect it before explicitly removing or replacing it."
}

if ($PSCmdlet.ShouldProcess($taskName, "Register a daily encrypted backup at $Time (current Windows user, only while signed in)")) {
  $action = New-ScheduledTaskAction -Execute $node -Argument "`"$tsx`" `"$script`" create" -WorkingDirectory $project
  $trigger = New-ScheduledTaskTrigger -Daily -At ([DateTime]::ParseExact($Time, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture))
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Local encrypted Track-suite PostgreSQL backup; credentials and key remain outside task arguments.' | Out-Null
  Write-Output "Registered $taskName. Check Task Scheduler Last Run Result regularly. An offline laptop or stopped PostgreSQL cannot back up."
}
