const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const toolsRootDir = path.join(__dirname, '..');

function ask(question, defaultVal) {
  return new Promise(resolve => {
    const promptStr = defaultVal !== undefined && defaultVal !== '' ? `${question} [${defaultVal}]: ` : `${question}: `;
    rl.question(promptStr, answer => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

function findMpr(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() && e.name.endsWith('.mpr')) {
        return path.join(dir, e.name);
      }
    }
    // check 1 level down
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.')) {
        const sub = path.join(dir, e.name);
        const subEntries = fs.readdirSync(sub, { withFileTypes: true });
        for (const se of subEntries) {
          if (!se.isDirectory() && se.name.endsWith('.mpr')) {
            return path.join(sub, se.name);
          }
        }
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

function detectMendixVersion(mprPath) {
  if (!mprPath || !fs.existsSync(mprPath)) return null;
  try {
    const buf = fs.readFileSync(mprPath);
    const str = buf.toString('latin1', 0, Math.min(buf.length, 1024 * 512));
    const match = str.match(/\b(1[0-2]\.\d+(?:\.\d+)?)\b/);
    if (match) return match[1];
  } catch (e) {}
  return null;
}

function isVersion1112OrHigher(versionStr) {
  if (!versionStr) return false;
  const parts = versionStr.split('.').map(n => parseInt(n, 10));
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  if (major > 11) return true;
  if (major === 11 && minor >= 12) return true;
  return false;
}

function formatBearerToken(token) {
  if (!token) return '';
  const trimmed = token.trim();
  if (!trimmed) return '';
  if (/^bearer\s+/i.test(trimmed)) {
    return `Bearer ${trimmed.replace(/^bearer\s+/i, '')}`;
  }
  return `Bearer ${trimmed}`;
}

function detectMendixModule(mendixDir) {
  const candidate = path.join(mendixDir, 'skillssource', '_modules', 'menditect_agentictestskills');
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return candidate;
  }
  return null;
}

function mergeJsonFile(filePath, updater) {
  let existing = {};
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      existing = {};
    }
  }
  const updated = updater(existing);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
}

function generateIdeConfigs(workspaceDir, mcpSource, projectDir, mprPath, mtaUrl, appName, mtaAuthHeader, pluginToken) {
  const isToolsWorkspace = path.resolve(workspaceDir) === path.resolve(toolsRootDir);
  const proxyScriptPath = isToolsWorkspace
    ? '${workspaceFolder}/scripts/mta-proxy.js'
    : path.join(toolsRootDir, 'scripts', 'mta-proxy.js').replace(/\\/g, '/');

  const newMcpServers = {
    "mta": {
      "command": "node",
      "args": [proxyScriptPath, "mta"]
    },
    "mta_plugin": {
      "command": "node",
      "args": [proxyScriptPath, "plugin"]
    }
  };

  if (mcpSource === 'studiopro') {
    newMcpServers['StudioPro'] = {
      "command": "node",
      "args": [proxyScriptPath, "studiopro"]
    };
    console.log('Note: Studio Pro MCP defaults to port 7782. Edit generated IDE configs if your port differs.');
  }

  // 1. VS Code .vscode/mcp.json (merge servers)
  mergeJsonFile(path.join(workspaceDir, '.vscode', 'mcp.json'), (existing) => {
    return {
      ...existing,
      mcpServers: {
        ...(existing.mcpServers || {}),
        ...newMcpServers
      }
    };
  });

  // 2. VS Code .vscode/settings.json (merge terminal env vars)
  const envVars = {
    "MENDIX_PROJECT_PATH": projectDir || "",
    "MENDIX_MPR_FILE": mprPath || "",
    "MENDIX_APP_NAME": appName || "",
    "MTA_BASE_URL": mtaUrl || "",
    "MTA_MCP_AUTH_HEADER": mtaAuthHeader || "",
    "PLUGIN_MCP_TOKEN": pluginToken || "",
    "MTA_OUTPUT_PATH": "${workspaceFolder}/menditect-output"
  };

  mergeJsonFile(path.join(workspaceDir, '.vscode', 'settings.json'), (existing) => {
    return {
      ...existing,
      "terminal.integrated.env.windows": {
        ...(existing["terminal.integrated.env.windows"] || {}),
        ...envVars
      },
      "terminal.integrated.env.linux": {
        ...(existing["terminal.integrated.env.linux"] || {}),
        ...envVars
      },
      "terminal.integrated.env.osx": {
        ...(existing["terminal.integrated.env.osx"] || {}),
        ...envVars
      }
    };
  });

  // 3. Cursor .cursor/mcp.json (merge servers)
  mergeJsonFile(path.join(workspaceDir, '.cursor', 'mcp.json'), (existing) => {
    return {
      ...existing,
      mcpServers: {
        ...(existing.mcpServers || {}),
        ...newMcpServers
      }
    };
  });

  // 4. Claude .claude/settings.json (merge mcpServers while preserving permissions and other settings)
  mergeJsonFile(path.join(workspaceDir, '.claude', 'settings.json'), (existing) => {
    return {
      ...existing,
      mcpServers: {
        ...(existing.mcpServers || {}),
        ...newMcpServers
      }
    };
  });

  console.log(`Generated and merged IDE configurations in ${workspaceDir}`);
}

function deployMxcliWrappers(targetDir, mprName) {
  if (path.resolve(targetDir) === path.resolve(toolsRootDir)) return;

  const binDirInTools = path.join(toolsRootDir, 'bin').replace(/\\/g, '/');
  const mprArg = mprName ? ` -p "%SCRIPT_DIR%${mprName}"` : '';
  const mprArgSh = mprName ? ` -p "$SCRIPT_DIR/${mprName}"` : '';

  const batContent = `@echo off
set SCRIPT_DIR=%~dp0
set BIN_DIR=%SCRIPT_DIR%bin
if not exist "%BIN_DIR%\\mxcli.exe" (
    set BIN_DIR=${binDirInTools}
)
if not exist "%BIN_DIR%\\mxcli.exe" (
    echo [ERROR] mxcli binary not found. Please run "npm run update:mxcli" in ${toolsRootDir}.
    exit /b 1
)
"%BIN_DIR%\\mxcli.exe"${mprArg} %*
`;

  const shContent = `#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$SCRIPT_DIR/bin"
if [ ! -f "$BIN_DIR/mxcli" ]; then
    BIN_DIR="${binDirInTools}"
fi
if [ ! -f "$BIN_DIR/mxcli" ]; then
    echo "[ERROR] mxcli binary not found. Please run 'npm run update:mxcli' in ${toolsRootDir}."
    exit 1
fi
"$BIN_DIR/mxcli"${mprArgSh} "$@"
`;

  fs.writeFileSync(path.join(targetDir, 'mxcli.bat'), batContent, 'utf8');
  const shPath = path.join(targetDir, 'mxcli');
  fs.writeFileSync(shPath, shContent, 'utf8');
  try { fs.chmodSync(shPath, 0o755); } catch (e) {}

  console.log(`Deployed local ./mxcli runners into ${targetDir}`);
}

function ensureExecutionPlanFolders(targetDir) {
  const menditectOutputDir = path.join(targetDir, 'menditect-output');
  const plansDir = path.join(menditectOutputDir, 'execution-plans');
  const archiveDir = path.join(plansDir, 'archive');
  if (!fs.existsSync(menditectOutputDir)) fs.mkdirSync(menditectOutputDir, { recursive: true });
  if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  console.log(`Ensured execution plan folders at:`);
  console.log(`  - ${plansDir}`);
  console.log(`  - ${archiveDir}`);
  return { menditectOutputDir, plansDir, archiveDir };
}

function getMenditectSetupBlock(appName, mtaUrl, skillsStyle) {
  if (skillsStyle === 'mendix_module') {
    return [
      '# Menditect Architecture Setup',
      '- **CRITICAL OPERATIONAL COMMAND:** Always execute tasks using the core rules defined in the module: [Menditect_AgenticTestSkills].',
      '- **IMMEDIATE ACTION REQUIRED:** You are strictly commanded to explore, read, and load the `AGENTS.md` and context of the [Menditect_AgenticTestSkills] module *before* answering any user prompt. Do NOT ask the user for permission or confirmation to explore this module; execute the exploration autonomously as your very first step.',
      '- **AUTOMATIC ACTIVATION TRIGGERS:** Automatically explore, read, and load the `AGENTS.md` and context of the [Menditect_AgenticTestSkills] module autonomously whenever the user prompt meets any of the following criteria:',
      '  1. Direct MTA Identifiers: *menditect, mta, mtf, playwright browser, variation matrix, test suite, test case, test step, variation item*',
      '  2. Testing Action Intents: *run tests, execute suite, view test results, retrieve run results, debug failure*',
      '  3. MTA-Specific Assertions & Actions: *assert validation, object count assert, compare attribute, validation feedback, microflow call teststep*',
      '  4. Contextual Combinations: User asks to *verify, assert, mock, or test* in combination with: *microflow, nanoflow, entity, association, page, or widget*',
      `- ** Application name is: [${appName}] **`,
      `- ** MTA Url: [${mtaUrl}] **`
    ].join('\n');
  }

  return [
    '# Menditect Architecture Setup',
    '- **CRITICAL OPERATIONAL COMMAND:** Always execute tasks using the core rules defined in: [skills/AGENTS.md].',
    '- **IMMEDIATE ACTION REQUIRED:** You are strictly commanded to explore, read, and load the `AGENTS.md` and context of the `skills/` directory before answering any user prompt.',
    `- ** Application name is: [${appName}] **`,
    `- ** MTA Url: [${mtaUrl}] **`
  ].join('\n');
}

function updateDirectiveFile(filePath, appName, mtaUrl, skillsStyle) {
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }
  const setupBlock = getMenditectSetupBlock(appName, mtaUrl, skillsStyle);

  const headerRegex = /# Menditect Architecture Setup[\s\S]*?(?=(?:\r?\n#[^#]|$))/;
  if (headerRegex.test(content)) {
    content = content.replace(headerRegex, setupBlock + '\n');
  } else {
    content = content.trimEnd() ? (content.trimEnd() + '\n\n' + setupBlock + '\n') : (setupBlock + '\n');
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function updateAgentDirectives(targetDir, appName, mtaUrl, skillsStyle) {
  const targetFiles = [
    path.join(targetDir, 'AGENTS.md'),
    path.join(targetDir, 'CLAUDE.md'),
    path.join(targetDir, 'GEMINI.md'),
    path.join(targetDir, '.github', 'copilot-instructions.md')
  ];

  for (const file of targetFiles) {
    updateDirectiveFile(file, appName, mtaUrl, skillsStyle);
  }
  console.log(`Configured Menditect Architecture Setup in ${targetDir}`);
}

async function run() {
  console.log('======================================================');
  console.log(' Menditect Agent Workspace Setup');
  console.log('======================================================\n');

  console.log('NOTICE AND DISCLAIMER:');
  console.log('------------------------------------------------------');
  console.log('This project and setup tooling have been vibe-coded with');
  console.log('AI coding assistants and are provided strictly "AS IS".');
  console.log('Menditect B.V. provides NO official support, SLAs, or guarantees');
  console.log('if anything fails to work as expected, and accepts NO liability');
  console.log('for any damages, corrupted files, data loss, or unintended actions');
  console.log('(as governed by the Apache License 2.0).');
  console.log('');
  console.log('Safety precautions:');
  console.log('- Always ensure your Mendix project is committed to Git before continuing.');
  console.log('- Do not run tools against projects actively open in Studio Pro.');
  console.log('------------------------------------------------------\n');

  const acknowledge = await ask('Do you acknowledge and accept these terms to continue? (y/n)', 'y');
  if (!acknowledge.toLowerCase().startsWith('y')) {
    console.log('\nSetup aborted by user. Exiting without modifying any files.');
    process.exit(0);
  }
  console.log('');

  let existingConfig = {};
  try {
    const existingConfigPath = path.join(toolsRootDir, 'mta_config.json');
    if (fs.existsSync(existingConfigPath)) {
      existingConfig = JSON.parse(fs.readFileSync(existingConfigPath, 'utf8'));
    }
  } catch (e) {}

  // 1. Detailed breakdown of files & Git impact before choosing workspace
  console.log('Before choosing your workspace, review where files will be placed and how Git is affected:\n');

  console.log('[1] Dedicated Tools Workspace (Clone root: ' + toolsRootDir + ')');
  console.log('    - Placed in agentic-test-tools:');
  console.log('      * skills/ (MTA test design, build, and run skills)');
  console.log('      * .vscode/, .cursor/, .claude/ IDE configuration files');
  console.log('      * AGENTS.md, CLAUDE.md, GEMINI.md');
  console.log('      * menditect-output/execution-plans/ and menditect-output/execution-plans/archive/');
  console.log('      * bin/mxcli.exe and root ./mxcli runner scripts');
  console.log('    - Git Impact:');
  console.log('      * ZERO files created or modified in your Mendix project repository.');
  console.log('      * Keeps your Mendix project Git history completely untouched.\n');

  console.log('[2] Direct Mendix Project Workspace (Your local Mendix project folder)');
  console.log('    - Placed in your Mendix project:');
  console.log('      * Skills: skillssource/_modules/menditect_agentictestskills/ (if Mendix 11.12+ and module installed) or ./skills/');
  console.log('      * Directives: Appends Menditect Setup to project AGENTS.md (existing rules preserved)');
  console.log('      * IDE Configs: Merged into .vscode/, .cursor/, and .claude/ (preserves existing permissions)');
  console.log('      * Local Runners: mxcli.bat and ./mxcli deployed in project root');
  console.log('      * Execution Plans: menditect-output/execution-plans/ and menditect-output/execution-plans/archive/');
  console.log('    - Git Impact (Important for Mendix Repositories):');
  console.log('      * Typical Mendix projects have their own Git repositories.');
  console.log('      * All files created will be tracked by your Mendix project Git repository,');
  console.log('        allowing your entire team to share skills and agent configs directly with the app.\n');

  console.log('[3] Other Custom Directory');
  console.log('    - Files placed in your specified directory.');
  console.log('    - Git Impact: Isolated to that custom directory.\n');

  let defaultWorkspaceChoice = '1';
  if (existingConfig.workspace_type === 'mendix_project') defaultWorkspaceChoice = '2';
  if (existingConfig.workspace_type === 'custom') defaultWorkspaceChoice = '3';

  let workspaceChoice = '';
  while (workspaceChoice !== '1' && workspaceChoice !== '2' && workspaceChoice !== '3') {
    workspaceChoice = await ask('Select Workspace Option (1/2/3)', defaultWorkspaceChoice);
  }

  // 2. Mendix Project Directory and .mpr inspection
  let projectDir = existingConfig.mendix_project_dir || '';
  if (workspaceChoice === '2') {
    projectDir = await ask('Mendix Project Directory', projectDir || process.cwd());
  } else {
    projectDir = await ask('Mendix Project Directory (for mxcli model reading)', projectDir || process.cwd());
  }

  let mprPath = '';
  const foundMpr = findMpr(projectDir);
  if (foundMpr) {
    console.log(`Found Mendix .mpr file: ${foundMpr}`);
    mprPath = foundMpr;
  } else {
    console.log('Warning: No .mpr file found in directory.');
  }

  // Verify Mendix Version (Module-level skills require Mendix 11.12+)
  let detectedVersion = detectMendixVersion(mprPath);
  let isMendix1112Plus = false;

  if (detectedVersion) {
    console.log(`Detected Mendix Studio Pro version: ${detectedVersion}`);
    isMendix1112Plus = isVersion1112OrHigher(detectedVersion);
    if (!isMendix1112Plus) {
      console.log(`Note: Mendix ${detectedVersion} is below 11.12. Module-level skills require Mendix 11.12 or higher.`);
    }
  } else if (workspaceChoice === '2') {
    const ans = await ask('Is this project running Mendix 11.12 or higher? (Module-level skills require 11.12+) (y/n)', 'y');
    isMendix1112Plus = ans.toLowerCase().startsWith('y');
  }

  // 3. Resolve Workspace Directory & Skills Destination
  let workspaceType = 'clone_root';
  let workspaceDir = toolsRootDir;
  let skillsDir = path.join(toolsRootDir, 'skills');
  let skillsStyle = 'standard';

  if (workspaceChoice === '1') {
    workspaceType = 'clone_root';
    workspaceDir = toolsRootDir;
    skillsDir = path.join(toolsRootDir, 'skills');
    skillsStyle = 'standard';
    console.log(`\nWorkspace: Tools Clone Root (${workspaceDir})`);
    console.log(`Skills destination: ${skillsDir}`);
  } else if (workspaceChoice === '2') {
    workspaceType = 'mendix_project';
    workspaceDir = projectDir;

    if (!isMendix1112Plus) {
      skillsDir = path.join(workspaceDir, 'skills');
      skillsStyle = 'standard';
      console.log(`\nMendix version does not support module skills (requires Mendix 11.12+).`);
      console.log(`Skills will be placed as project-level skills in: ${skillsDir}`);
    } else {
      const detectedModule = detectMendixModule(workspaceDir);
      if (detectedModule) {
        skillsDir = detectedModule;
        skillsStyle = 'mendix_module';
        console.log(`\n[FOUND] Menditect_AgenticTestSkills module detected at:`);
        console.log(`        ${path.relative(workspaceDir, detectedModule)}`);
        console.log(`Skills will be installed inside this module.`);
      } else {
        skillsDir = path.join(workspaceDir, 'skills');
        skillsStyle = 'standard';
        console.log(`\n[NOTICE] Menditect_AgenticTestSkills Marketplace module was not detected in this project.`);
        console.log(`Skills will be placed as project-level skills in ./skills/.`);
        console.log(`(Tip: Download Menditect_AgenticTestSkills from the Mendix Marketplace anytime,`);
        console.log(`then re-run setup to automatically relocate skills into the module.)`);
      }
    }
  } else if (workspaceChoice === '3') {
    workspaceType = 'custom';
    workspaceDir = await ask('Custom Workspace Directory', existingConfig.workspace_dir || toolsRootDir);
    skillsDir = path.join(workspaceDir, 'skills');
    skillsStyle = 'standard';
    console.log(`\nWorkspace: Custom Directory (${workspaceDir})`);
    console.log(`Skills destination: ${skillsDir}`);
  }

  // 4. MTA Endpoints & Tokens
  console.log('\n--- MTA Connection Settings ---');
  const defaultMtaUrl = existingConfig.mta_base_url || 'https://mta-trial.mendixcloud.com';
  const mtaUrl = await ask('MTA URL', defaultMtaUrl);
  const mcpEndpoint = mtaUrl.replace(/\/$/, '') + '/primitivetools/mcp';

  const defaultMtaToken = existingConfig.mta_auth_header || '';
  const rawMtaToken = await ask('MTA Bearer Token (e.g. Bearer <token> or raw token)', defaultMtaToken);
  const mtaAuthHeader = formatBearerToken(rawMtaToken);
  
  const defaultPluginUrl = existingConfig.plugin_mcp_url || 'http://localhost:8081/plugin/mcp';
  const pluginUrl = await ask('App under test Plugin URL', defaultPluginUrl);

  const defaultPluginToken = existingConfig.plugin_mcp_token || 'Bearer 1';
  const rawPluginToken = await ask('App under test Plugin Token (Bearer token recommended)', defaultPluginToken);
  const pluginToken = formatBearerToken(rawPluginToken);
  
  let modelSource = '';
  while (modelSource !== '1' && modelSource !== '2') {
    modelSource = await ask('Model Source: [1] mxcli, [2] Studio Pro MCP', existingConfig.model_source === 'studiopro' ? '2' : '1');
  }
  const mcpSource = modelSource === '2' ? 'studiopro' : 'mxcli';

  const defaultAppName = mprPath
    ? path.basename(mprPath, path.extname(mprPath))
    : (existingConfig.application_name || (projectDir ? path.basename(projectDir) : 'MyApp'));
  const appName = await ask('Application Name', defaultAppName);

  // 5. Ensure Execution Plans Storage and Archive Folders
  const { menditectOutputDir, plansDir, archiveDir } = ensureExecutionPlanFolders(workspaceDir);

  // 6. Save Configuration to mta_config.json
  const config = {
    workspace_type: workspaceType,
    workspace_dir: workspaceDir,
    skills_dir: skillsDir,
    skills_style: skillsStyle,
    mta_output_path: menditectOutputDir,
    execution_plans_dir: plansDir,
    execution_plans_archive_dir: archiveDir,
    mendix_version: detectedVersion || '',
    application_name: appName,
    mta_base_url: mtaUrl,
    mcp_endpoint: mcpEndpoint,
    mta_auth_header: mtaAuthHeader,
    plugin_mcp_url: pluginUrl,
    plugin_mcp_token: pluginToken,
    model_source: mcpSource,
    mendix_project_dir: projectDir,
    mendix_mpr_path: mprPath
  };

  fs.writeFileSync(path.join(toolsRootDir, 'mta_config.json'), JSON.stringify(config, null, 2));
  console.log('\nCreated / updated mta_config.json');

  // Also write mta_config.json to workspaceDir if different from toolsRootDir for local reference
  if (path.resolve(workspaceDir) !== path.resolve(toolsRootDir)) {
    try {
      fs.writeFileSync(path.join(workspaceDir, 'mta_config.json'), JSON.stringify(config, null, 2));
    } catch (e) {}
  }

  // 7. Write .env in workspace
  const envContent = `MTA_MCP_ENDPOINT="${mcpEndpoint}"
MTA_MCP_AUTH_HEADER="${mtaAuthHeader}"
PLUGIN_MCP_URL="${pluginUrl}"
PLUGIN_MCP_TOKEN="${pluginToken}"
MENDIX_PROJECT_DIR="${projectDir}"
MENDIX_MPR_PATH="${mprPath}"
MENDIX_APP_NAME="${appName}"
MTA_OUTPUT_PATH="${menditectOutputDir.replace(/\\/g, '/')}"
`;
  fs.writeFileSync(path.join(workspaceDir, '.env'), envContent);
  console.log(`Created .env in ${workspaceDir}`);

  // 8. Generate & Merge IDE Configs
  generateIdeConfigs(workspaceDir, mcpSource, projectDir, mprPath, mtaUrl, appName, mtaAuthHeader, pluginToken);

  // 9. Deploy local mxcli runners into workspace
  const mprFileName = mprPath ? path.basename(mprPath) : '';
  deployMxcliWrappers(workspaceDir, mprFileName);

  // 10. Update Agent Directives in workspaceDir
  updateAgentDirectives(workspaceDir, appName, mtaUrl, skillsStyle);

  console.log('\n======================================================');
  console.log(' Setup completed successfully!');
  console.log(` Workspace configured at: ${workspaceDir}`);
  console.log(` Skills destination:      ${skillsDir}`);
  console.log(` Execution plans:         ${plansDir}`);
  console.log(` Execution plans archive: ${archiveDir}`);
  console.log(' Next step: run "npm run update" to sync skills and binaries.');
  console.log('======================================================');
  rl.close();
}

run();
