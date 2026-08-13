const { execSync } = require('child_process');
try {
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    $f = New-Object System.Windows.Forms.FolderBrowserDialog
    $f.ShowNewFolderButton = $true
    $result = $f.ShowDialog()
    if ($result -eq "OK") {
      Write-Output $f.SelectedPath
    }
  `;
  const result = execSync(`powershell -STA -NoProfile -Command "${script.replace(/\n/g, '; ')}"`, { encoding: 'utf-8' });
  console.log('Result:', result.trim());
} catch (err) {
  console.error(err);
}
