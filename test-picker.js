const { execSync } = require('child_process');
try {
  const script = `
    Add-Type -AssemblyName System.windows.forms
    $f = New-Object System.Windows.Forms.FolderBrowserDialog
    $f.ShowNewFolderButton = $true
    $result = $f.ShowDialog()
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
      Write-Output $f.SelectedPath
    }
  `;
  const result = execSync(`powershell -Command "${script.replace(/\n/g, '; ')}"`, { encoding: 'utf-8' });
  console.log('Result:', result.trim());
} catch (err) {
  console.error(err);
}
