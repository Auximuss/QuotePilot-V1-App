' Demand Pilot — Silent Webhook Launcher
' Double-click this once to start the webhook with no terminal window.
' It will auto-start at every Windows login after the first run.

Dim WShell, FSO, ScriptDir
Set WShell  = CreateObject("WScript.Shell")
Set FSO     = CreateObject("Scripting.FileSystemObject")
ScriptDir   = FSO.GetParentFolderName(WScript.ScriptFullName)

' Find pythonw.exe (runs Python with no console window)
Dim PythonW
PythonW = WShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Python\Python312\pythonw.exe"
If Not FSO.FileExists(PythonW) Then
    ' Try PATH fallback
    PythonW = "pythonw"
End If

Dim WebhookScript
WebhookScript = ScriptDir & "\local_webhook.py"

' Launch silently — 0 = hidden window, False = don't wait
WShell.Run """" & PythonW & """ """ & WebhookScript & """", 0, False

WScript.Echo "Webhook started in background. The Run Now button will work."
