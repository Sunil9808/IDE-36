const fss = require('./server/services/fileSystem/fileSystemService.ts');
fss.buildFileTree('./server').then((tree: any) => console.log(JSON.stringify(tree, null, 2))).catch(console.error);
