# Demand Pilot — One-time Setup
# Right-click this file → Run with PowerShell (as Administrator)

$ScriptsDir  = "C:\Users\Alexp\OneDrive\Pictures\Desktop\New folder (3)\app\scripts"
$BatFile     = "$ScriptsDir\run_daily.bat"
$WebhookFile = "$ScriptsDir\local_webhook.py"
$Pythonw     = "pythonw"   # runs Python with no terminal window

# ── 1. 7am daily Instagram agent ─────────────────────────────────────────────
$TaskName7am = "DemandPilot_Instagram_7AM"
Unregister-ScheduledTask -TaskName $TaskName7am -Confirm:$false -ErrorAction SilentlyContinue

$action   = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$BatFile`""
$trigger  = New-ScheduledTaskTrigger -Daily -At "07:00"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 6)
Register-ScheduledTask -TaskName $TaskName7am -Action $action -Trigger $trigger -Settings $settings `
    -Description "Demand Pilot Instagram DM Agent — 7am daily" -RunLevel Highest -Force | Out-Null

Write-Host "✓ 7am daily task registered" -ForegroundColor Green

# ── 2. Webhook server — starts silently at Windows login, no terminal window ──
$TaskNameWH = "DemandPilot_Webhook_Server"
Unregister-ScheduledTask -TaskName $TaskNameWH -Confirm:$false -ErrorAction SilentlyContinue

$whAction   = New-ScheduledTaskAction -Execute $Pythonw -Argument "`"$WebhookFile`"" -WorkingDirectory $ScriptsDir
$whTrigger  = New-ScheduledTaskTrigger -AtLogOn
$whSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0)  # no time limit
Register-ScheduledTask -TaskName $TaskNameWH -Action $whAction -Trigger $whTrigger -Settings $whSettings `
    -Description "Demand Pilot webhook server — runs silently at login" -RunLevel Highest -Force | Out-Null

Write-Host "✓ Webhook server registered (starts silently at every login)" -ForegroundColor Green

# Start the webhook server right now too (no window)
Start-Process $Pythonw -ArgumentList "`"$WebhookFile`"" -WorkingDirectory $ScriptsDir -WindowStyle Hidden

Write-Host "✓ Webhook server started now (no window)" -ForegroundColor Green
Write-Host ""
Write-Host "All done! You can close this window." -ForegroundColor Cyan
Write-Host "  • Instagram agent runs at 7:00 AM daily" -ForegroundColor White
Write-Host "  • Admin panel Run button works silently in the background" -ForegroundColor White
Write-Host ""
