import path from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function profileArgumentPattern(profile) {
  const fullPath = path.win32.resolve(profile).replace(/[\\/]+$/, '');
  const escaped = fullPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Covers --flag=value, --flag="value with spaces", and "--flag=value with spaces".
  return '(?:^|\\s)"?--user-data-dir(?:=|\\s+)"?' + escaped + '[\\\\/]?"?(?=\\s|$)';
}

export function profileStopScript(profile) {
  const pattern = profileArgumentPattern(profile).replaceAll("'", "''");
  return `
$ErrorActionPreference = 'Stop'
$taskPattern = '${pattern}'
$taskProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('chrome.exe', 'chrome_crashpad_handler.exe') })
$taskOwned = [System.Collections.Generic.HashSet[int]]::new()
foreach ($taskProcess in $taskProcesses) {
  if ($taskProcess.CommandLine -match $taskPattern) { [void]$taskOwned.Add([int]$taskProcess.ProcessId) }
}
do {
  $taskAdded = $false
  foreach ($taskProcess in $taskProcesses) {
    if ($taskOwned.Contains([int]$taskProcess.ParentProcessId) -and $taskOwned.Add([int]$taskProcess.ProcessId)) { $taskAdded = $true }
  }
} while ($taskAdded)
foreach ($taskPid in $taskOwned) { Stop-Process -Id $taskPid -Force -ErrorAction SilentlyContinue }
# Child Chrome processes can exit between Get-Process and Wait-Process.
# Poll the exact owned set so an already-exited child is successful cleanup.
$taskExitDeadline = [DateTime]::UtcNow.AddSeconds(15)
do {
  $taskRemaining = @($taskOwned | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
  if ($taskRemaining.Count -eq 0) { break }
  if ([DateTime]::UtcNow -ge $taskExitDeadline) { throw ('Chrome processes did not exit: ' + ($taskRemaining -join ', ')) }
  Start-Sleep -Milliseconds 100
} while ($true)
Write-Output ('killed: ' + (($taskOwned | Sort-Object) -join ', '))
`;
}

export async function waitForEndpoint(probe, {ready, previous = '', timeoutMs = 15000, intervalMs = 250, pause = sleep} = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    const current = await probe();
    if (ready ? current && current !== previous : !current) return current;
    await pause(intervalMs);
  } while (Date.now() < deadline);
  throw new Error(ready ? '自动化 Chrome 新调试端点未就绪' : '自动化 Chrome 旧调试端点仍存在，已停止重启以避免连接旧实例');
}

export async function restartManagedChrome({stop, start, probe, previous, timeoutMs = 15000, pause}) {
  await stop();
  await waitForEndpoint(probe, {ready:false, timeoutMs, pause});
  await start();
  return waitForEndpoint(probe, {ready:true, previous, timeoutMs, pause});
}

export function isClosedBrowserPageError(error) {
  const message = String(error?.message ?? error);
  // Only page creation failures are recoverable here. Navigation failures,
  // form timeouts and extraction errors must keep their original meaning.
  return /browserContext\.newPage|context\.newPage|Target\.createTarget/i.test(message)
    && /Failed to open a new tab|(?:target|browser|context|connection|session)[^\n]*closed|not connected/i.test(message);
}
