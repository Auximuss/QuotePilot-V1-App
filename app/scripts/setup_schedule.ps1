# Demand Pilot — 7am Daily Instagram Agent Setup
# Run this once (right-click → Run as Administrator)

$TaskName = "DemandPilot_Instagram_7AM"
$BatFile  = "C:\Users\Alexp\OneDrive\Pictures\Desktop\New folder (3)\app\scripts\run_daily.bat"

# Remove old task if exists
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action   = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$BatFile`""
$trigger  = New-ScheduledTaskTrigger -Daily -At "07:00"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 6)

Register-ScheduledTask `
    -TaskName    $TaskName `
    -Action      $action `
    -Trigger     $trigger `
    -Settings    $settings `
    -Description "Demand Pilot Instagram DM Agent — runs at 7am daily" `
    -RunLevel    Highest `
    -Force | Out-Null

Write-Host ""
Write-Host "✓ Done! Task: $TaskName" -ForegroundColor Green
Write-Host "  Instagram agent will run automatically at 7:00 AM every day." -ForegroundColor Green
Write-Host ""
Write-Host "  Run it right now with:" -ForegroundColor Cyan
Write-Host "  schtasks /run /tn `"$TaskName`"" -ForegroundColor White
Write-Host ""
