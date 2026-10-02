const { execSync } = require('child_process');
try {
  const script = `
    $app = New-Object -ComObject Shell.Application
    $folder = $app.BrowseForFolder(0, "Select Folder", 0, 0)
    if ($folder) { Write-Output $folder.Self.Path }
  `;
  const result = execSync(`powershell -Command "${script.replace(/\n/g, '; ')}"`, { encoding: 'utf-8' });
  console.log('Result:', result.trim());
} catch (err) {
  console.error(err);
}
