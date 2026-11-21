$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
$localDir = Join-Path $projectDir '.local'
$runtimeDir = Join-Path $localDir 'comfy/ComfyUI_windows_portable'
$pythonPath = Join-Path $runtimeDir 'python_embeded/python.exe'
if (!(Test-Path -LiteralPath $pythonPath)) {
  throw 'ComfyUI portable runtime was not found in .local/comfy/ComfyUI_windows_portable.'
}
$enginePort = if ($env:THINKING_LAB_COMFY_PORT) { [int]$env:THINKING_LAB_COMFY_PORT } else { 8188 }
$baseUrl = 'http://127.0.0.1:' + $enginePort
try {
  $existing = Invoke-RestMethod -Uri ($baseUrl + '/system_stats') -TimeoutSec 2
  if ($existing.system.comfyui_version) { Write-Output ('ComfyUI is ready at ' + $baseUrl); return }
} catch {}
$modelDir = Join-Path $localDir 'models'
$configPath = Join-Path $localDir 'comfy/thinking-lab-models.yaml'
$config = @"
thinking_lab:
  base_path: '$($modelDir.Replace('\','/').Replace("'","''"))'
  checkpoints: checkpoints
  text_encoders: text_encoders
  diffusion_models: diffusion_models
  vae: vae
  clip_vision: clip_vision
"@
[System.IO.File]::WriteAllText($configPath,$config,[System.Text.UTF8Encoding]::new($false))
$logDir = Join-Path $localDir 'comfy/logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logBase = Join-Path $logDir ([DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff'))
$flags = @('-s','ComfyUI/main.py','--windows-standalone-build','--listen','127.0.0.1','--port',"$enginePort",'--disable-auto-launch','--offline','--extra-model-paths-config',('"' + $configPath + '"'))
$worker = Start-Process -FilePath $pythonPath -ArgumentList $flags -WorkingDirectory $runtimeDir -WindowStyle Hidden -RedirectStandardOutput ($logBase + '.out') -RedirectStandardError ($logBase + '.err') -PassThru
Write-Output ('Local ComfyUI started. PID ' + $worker.Id + ', ' + $baseUrl + ', log ' + $logBase + '.err')
