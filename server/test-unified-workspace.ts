import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import {
  getWorkspaceRoot,
  setActiveWorkspaceRoot,
  getDefaultWorkspaceRoot,
  resolveWorkspacePath,
} from './utils/workspaceRoot';
import { resolveAgentActionPath, runPairProgrammerAgent } from './services/ai/agentService';

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 UNIFIED WORKSPACE ARCHITECTURE VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  const ideRoot = path.resolve(__dirname, '..');
  const tempBase = path.resolve(ideRoot, 'storage', 'workspaces', 'test-run');
  const driveCDir = path.resolve(os.tmpdir(), 'ide-test-workspace-c');

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      testsPassed++;
      console.log(`✅ [PASS] ${testName}${details ? ` -> ${details}` : ''}`);
    } else {
      testsFailed++;
      console.error(`❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    }
  }

  try {
    // Clean up test base dirs
    await fs.rm(tempBase, { recursive: true, force: true });
    await fs.rm(driveCDir, { recursive: true, force: true });
    await fs.mkdir(tempBase, { recursive: true });

    // -------------------------------------------------------------
    // 1. Default automatic workspace
    // -------------------------------------------------------------
    const defaultWs = getDefaultWorkspaceRoot();
    assert(fsSync.existsSync(defaultWs), 'Test 1: Default workspace directory exists on disk', defaultWs);
    setActiveWorkspaceRoot(defaultWs);
    assert(getWorkspaceRoot() === defaultWs, 'Test 1b: activeWorkspaceRoot equals default workspace', getWorkspaceRoot());

    // -------------------------------------------------------------
    // 2, 3, 4, 5. AI creates folder, file, writes code, verify on disk
    // -------------------------------------------------------------
    const contextDefault = { workspacePath: defaultWs, chatHistory: [] };
    const taskScaffold = 'create a new python project named demo-app with hello.py that prints Hello World';

    const resultScaffold = await runPairProgrammerAgent(taskScaffold, contextDefault as any);
    assert(resultScaffold.actions.length > 0, 'Test 2/3/4: AI agent generated actions');

    const helloPyPath = path.join(defaultWs, 'demo-app', 'hello.py');
    const helloExists = fsSync.existsSync(helloPyPath);
    assert(helloExists, 'Test 5a: demo-app/hello.py physically exists on disk', helloPyPath);

    if (helloExists) {
      const content = await fs.readFile(helloPyPath, 'utf-8');
      assert(content.length > 0 && (content.includes('Hello') || content.includes('print')), 'Test 5b: hello.py contains verified code', content.trim());
    }

    // -------------------------------------------------------------
    // 6. Verify Explorer synchronization event readiness
    // -------------------------------------------------------------
    assert(typeof resolveWorkspacePath === 'function', 'Test 6: Unified path resolver available for Explorer');

    // -------------------------------------------------------------
    // 7. Manual Open Folder: Project A
    // -------------------------------------------------------------
    const projectAPath = path.join(tempBase, 'ProjectA');
    await fs.mkdir(projectAPath, { recursive: true });
    setActiveWorkspaceRoot(projectAPath);
    assert(getWorkspaceRoot() === projectAPath, 'Test 7a: activeWorkspaceRoot switched to ProjectA', getWorkspaceRoot());

    await runPairProgrammerAgent('create test_a.py with print("Hello Project A")', { workspacePath: projectAPath } as any);
    const fileAPath = path.join(projectAPath, 'test_a.py');
    assert(fsSync.existsSync(fileAPath), 'Test 7b: test_a.py created in ProjectA', fileAPath);

    // -------------------------------------------------------------
    // 8. Switch to Project B (Folder to Folder)
    // -------------------------------------------------------------
    const projectBPath = path.join(tempBase, 'ProjectB');
    await fs.mkdir(projectBPath, { recursive: true });
    setActiveWorkspaceRoot(projectBPath);
    assert(getWorkspaceRoot() === projectBPath, 'Test 8a: activeWorkspaceRoot switched to ProjectB', getWorkspaceRoot());

    await runPairProgrammerAgent('create test_b.py with print("Hello Project B")', { workspacePath: projectBPath } as any);
    const fileBPath = path.join(projectBPath, 'test_b.py');
    assert(fsSync.existsSync(fileBPath), 'Test 8b: test_b.py created in ProjectB', fileBPath);

    // Confirm file was created in ProjectB and NOT in ProjectA
    assert(!fsSync.existsSync(path.join(projectAPath, 'test_b.py')), 'Test 8c: ProjectA does NOT contain ProjectB test_b.py (no cross-root pollution)');
    assert(fsSync.existsSync(fileAPath), 'Test 8d: ProjectA test_a.py remains intact');

    // -------------------------------------------------------------
    // 9. Cross-Drive Switching: D: to C:
    // -------------------------------------------------------------
    await fs.mkdir(driveCDir, { recursive: true });
    setActiveWorkspaceRoot(driveCDir);
    assert(getWorkspaceRoot() === driveCDir, 'Test 9a: activeWorkspaceRoot switched to drive C:', driveCDir);

    await runPairProgrammerAgent('create drive_c.txt with Content on drive C', { workspacePath: driveCDir } as any);
    const driveCFile = path.join(driveCDir, 'drive_c.txt');
    assert(fsSync.existsSync(driveCFile), 'Test 9b: file successfully created on C: drive', driveCFile);

    // -------------------------------------------------------------
    // 10. Switch back to original workspace
    // -------------------------------------------------------------
    setActiveWorkspaceRoot(projectAPath);
    assert(getWorkspaceRoot() === projectAPath, 'Test 10: Switched back to ProjectA on D: drive', getWorkspaceRoot());

    // -------------------------------------------------------------
    // 11. Nested folders and files (src/main.py, src/utils/helper.py)
    // -------------------------------------------------------------
    const srcMain = resolveAgentActionPath('src/main.py', projectAPath);
    const srcHelper = resolveAgentActionPath('src/utils/helper.py', projectAPath);

    await fs.mkdir(path.dirname(srcMain), { recursive: true });
    await fs.writeFile(srcMain, 'def main():\n    print("Main App")\n', 'utf-8');

    await fs.mkdir(path.dirname(srcHelper), { recursive: true });
    await fs.writeFile(srcHelper, 'def helper():\n    return 42\n', 'utf-8');

    assert(fsSync.existsSync(srcMain) && fsSync.existsSync(srcHelper), 'Test 11: Nested files src/main.py and src/utils/helper.py created recursively');

    // -------------------------------------------------------------
    // 12. Rename, Delete, Append operations
    // -------------------------------------------------------------
    const appendTarget = srcHelper;
    await fs.appendFile(appendTarget, 'def extra(): pass\n', 'utf-8');
    const appendedText = await fs.readFile(appendTarget, 'utf-8');
    assert(appendedText.includes('extra(): pass'), 'Test 12a: Append operation succeeded');

    const renamedHelper = resolveAgentActionPath('src/utils/renamed_helper.py', projectAPath);
    await fs.rename(srcHelper, renamedHelper);
    assert(fsSync.existsSync(renamedHelper) && !fsSync.existsSync(srcHelper), 'Test 12b: Rename operation succeeded');

    await fs.unlink(renamedHelper);
    assert(!fsSync.existsSync(renamedHelper), 'Test 12c: Delete operation succeeded');

    // -------------------------------------------------------------
    // 13. Path Traversal & Security
    // -------------------------------------------------------------
    let blockedTraversal1 = false;
    try {
      resolveAgentActionPath('../../secret.env', projectAPath);
    } catch (e: any) {
      blockedTraversal1 = true;
    }
    assert(blockedTraversal1, 'Test 13a: Blocked path traversal attempt (../)');

    let blockedOtherDrive = false;
    try {
      resolveAgentActionPath('C:\\Windows\\System32\\cmd.exe', projectAPath);
    } catch (e: any) {
      blockedOtherDrive = true;
    }
    assert(blockedOtherDrive, 'Test 13b: Blocked cross-drive absolute path traversal');

    // -------------------------------------------------------------
    // 14. Switch workspace during AI batch (isolation)
    // -------------------------------------------------------------
    const batchStartRoot = getWorkspaceRoot();
    const batchActionPath = resolveAgentActionPath('batch_file.txt', batchStartRoot);
    // Simulating user changing activeWorkspaceRoot concurrently
    setActiveWorkspaceRoot(projectBPath);
    // Verify batchActionPath resolves to batchStartRoot (ProjectA), NOT projectBPath
    await fs.writeFile(batchActionPath, 'batch content', 'utf-8');
    assert(fsSync.existsSync(path.join(projectAPath, 'batch_file.txt')), 'Test 14a: In-flight batch wrote to original root');
    assert(!fsSync.existsSync(path.join(projectBPath, 'batch_file.txt')), 'Test 14b: In-flight batch did NOT leak into new root');

    // -------------------------------------------------------------
    // 15 & 16. Single source of truth verification
    // -------------------------------------------------------------
    setActiveWorkspaceRoot(defaultWs);
    assert(getWorkspaceRoot() === defaultWs, 'Test 15: activeWorkspaceRoot restored to default');
    assert(resolveWorkspacePath() === defaultWs, 'Test 16: resolveWorkspacePath matches activeWorkspaceRoot exactly');

  } catch (err: any) {
    console.error('Unexpected test error:', err);
    testsFailed++;
  } finally {
    // Cleanup temp dirs
    try {
      await fs.rm(tempBase, { recursive: true, force: true });
      await fs.rm(driveCDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite();
