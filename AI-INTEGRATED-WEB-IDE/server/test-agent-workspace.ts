import path from 'path';
import fs from 'fs/promises';
import { runPairProgrammerAgent, resolveAgentActionPath } from './services/ai/agentService';
import { getWorkspaceRoot } from './utils/workspaceRoot';

async function runTests() {
  console.log('🧪 Starting Agent Workspace Integration Tests...');
  const baseRoot = getWorkspaceRoot();
  const testWorkspaceDir = path.resolve(baseRoot, 'temp-test-workspace');

  try {
    // 1. Clean up and create temp test workspace directory
    await fs.rm(testWorkspaceDir, { recursive: true, force: true });
    await fs.mkdir(testWorkspaceDir, { recursive: true });

    // 2. Test 1: Verify files are created inside the active workspace
    console.log('\n👉 Test 1: Verify file creation is scoped to active workspace...');
    const context1 = {
      model: 'test-model',
      workspacePath: `/workspace/temp-test-workspace`,
      chatHistory: [],
    };

    const projectTask = 'create a new react project named temp-test-workspace';
    
    const result1 = await runPairProgrammerAgent(projectTask, context1);
    console.log('Result 1 Summary:', result1.summary);
    
    // Check if files were written inside the temp-test-workspace directory
    const packageJsonPath = path.join(testWorkspaceDir, 'temp-test-workspace', 'package.json');
    const fileExists = await fs.access(packageJsonPath).then(() => true).catch(() => false);
    
    if (fileExists) {
      console.log('✅ Success: package.json created successfully inside user workspace directory!');
    } else {
      throw new Error('❌ Failure: package.json was not found at ' + packageJsonPath);
    }

    // 3. Test 2: Verify protection of IDE files when workspace is IDE root
    console.log('\n👉 Test 2: Verify security guard blocks edits to internal IDE files...');
    
    // The baseRoot is the IDE root (c:\coding\ideeb\AI-Intergrated-Web-IDE)
    // We try to resolve path inside src/ or package.json when effectiveRoot is baseRoot.
    // It should throw a Security Exception.
    
    let caughtException1 = false;
    try {
      resolveAgentActionPath('src/components/Button.tsx', baseRoot);
    } catch (error: any) {
      if (error.message.includes('Security Exception')) {
        caughtException1 = true;
        console.log('✅ Success: Correctly blocked access to internal src/ folder!');
      } else {
        console.error('Unexpected error:', error);
      }
    }
    if (!caughtException1) {
      throw new Error('❌ Failure: Did not block edit inside internal src/ folder!');
    }

    let caughtException2 = false;
    try {
      resolveAgentActionPath('package.json', baseRoot);
    } catch (error: any) {
      if (error.message.includes('Security Exception')) {
        caughtException2 = true;
        console.log('✅ Success: Correctly blocked modification of main package.json!');
      } else {
        console.error('Unexpected error:', error);
      }
    }
    if (!caughtException2) {
      throw new Error('❌ Failure: Did not block edit to main package.json!');
    }

    // Check that we can write to a new/different folder name under baseRoot (like temp-test-workspace)
    try {
      const allowedPath = resolveAgentActionPath('temp-test-workspace/somefile.txt', baseRoot);
      console.log('✅ Success: Correctly allowed path outside protected scope:', path.relative(baseRoot, allowedPath));
    } catch (error: any) {
      throw new Error('❌ Failure: Incorrectly blocked allowed file path: ' + error.message);
    }

    console.log('\n🎉 All tests passed successfully!');

  } catch (error) {
    console.error('❌ Integration Test Failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await fs.rm(testWorkspaceDir, { recursive: true, force: true });
    console.log('\n🧹 Temp test workspace cleaned up.');
  }
}

runTests();
