const { execSync } = require('child_process');
const http = require('http');

try {
  const args = process.argv.slice(2);
  const action = args[0] ? args[0].replace('ai-ide://', '').replace(/\//g, '') : '';
  
  if (action === 'pick-folder') {
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $f = New-Object System.Windows.Forms.FolderBrowserDialog
      $f.ShowNewFolderButton = $true
      $f.RootFolder = "MyComputer"
      $result = $f.ShowDialog()
      if ($result -eq "OK") { Write-Output $f.SelectedPath }
    `;
    const path = execSync(`powershell -STA -NoProfile -Command "${psScript.replace(/\n/g, '; ')}"`, { encoding: 'utf-8' }).trim();
    if (path) {
      const data = JSON.stringify({ path });
      const req = http.request({
        hostname: 'localhost',
        port: 5000,
        path: '/api/workspace/set-root',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      });
      req.on('error', (e) => console.error(e));
      req.write(data);
      req.end();
    }
  }
} catch (e) {
  console.error(e);
}
