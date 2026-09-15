const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawn } = require('child_process');

let rl = null;

function getReadline() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return rl;
}

const toolsRootDir = path.join(__dirname, '..');
let scriptVersion = '';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(toolsRootDir, 'package.json'), 'utf8'));
  if (pkg.version) scriptVersion = ` (v${pkg.version})`;
} catch (e) {}

function ask(question, defaultVal) {
  return new Promise(resolve => {
    const activeRl = getReadline();
    if (activeRl.closed) {
      return resolve(defaultVal !== undefined ? String(defaultVal) : '');
    }
    const promptStr = defaultVal !== undefined && defaultVal !== '' ? `${question} [${defaultVal}]: ` : `${question}: `;
    activeRl.question(promptStr, answer => {
      resolve(answer.trim() || (defaultVal !== undefined ? String(defaultVal) : ''));
    });
  });
}

function normalizeConfigAliases(cfg) {
  if (!cfg || typeof cfg !== 'object') return {};
  const normalized = { ...cfg };
  normalized.mendix_mpr_path = cfg.mendix_mpr_path || cfg.mpr_path || cfg.mprPath || '';
  normalized.mendix_project_dir = cfg.mendix_project_dir || cfg.project_dir || cfg.projectDir || '';
  normalized.mta_base_url = cfg.mta_base_url || cfg.mta_url || cfg.mtaUrl || '';
  normalized.default_app_instance_token = cfg.default_app_instance_token || (cfg.app_instances && cfg.app_instances[0]?.token) || cfg.instance_token || '';
  normalized.execution_plans_dir = cfg.execution_plans_dir || (cfg.mta_output_path ? path.join(cfg.mta_output_path, 'execution-plans') : '');
  return normalized;
}

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch (e) {}
}

function ensureGitIgnoreEntries(dirPath, entries) {
  const gitIgnorePath = path.join(dirPath, '.gitignore');
  let currentContent = '';
  if (fs.existsSync(gitIgnorePath)) {
    try {
      currentContent = fs.readFileSync(gitIgnorePath, 'utf8');
    } catch (e) {
      return;
    }
  }

  const linesToAdd = entries.filter(entry => {
    const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\r?\\n)${escaped}(\\r?\\n|$)`);
    return !regex.test(currentContent);
  });

  if (linesToAdd.length > 0) {
    const header = currentContent.trimEnd() ? '\n\n# Menditect Agent local environment & secrets\n' : '# Menditect Agent local environment & secrets\n';
    const updated = currentContent.trimEnd() + header + linesToAdd.join('\n') + '\n';
    try {
      fs.writeFileSync(gitIgnorePath, updated, 'utf8');
      console.log(`Protected ${path.relative(process.cwd(), gitIgnorePath) || '.gitignore'}: added [${linesToAdd.join(', ')}]`);
    } catch (e) {
      console.warn(`Warning: Could not update ${gitIgnorePath}: ${e.message}`);
    }
  }
}

// Pre-load ambient secrets from tools root if available
loadEnvFile(path.join(toolsRootDir, '.env.local'));
loadEnvFile(path.join(toolsRootDir, '.env'));

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

function parseInstanceSelection(input, instances) {
  const trimmed = (input || '').trim().toLowerCase();
  if (!trimmed || trimmed === 'all' || trimmed === 'y' || trimmed === 'yes') {
    return { type: 'all', selected: instances };
  }
  if (trimmed === 'none' || trimmed === 'n' || trimmed === 'no') {
    return { type: 'none', selected: [] };
  }

  const tokens = trimmed.split(/[, ]+/).filter(Boolean);
  const selectedIndices = new Set();

  for (const token of tokens) {
    if (token.includes('-')) {
      const [startStr, endStr] = token.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let idx = start; idx <= end; idx++) {
          if (idx >= 1 && idx <= instances.length) {
            selectedIndices.add(idx - 1);
          } else {
            return { type: 'invalid', selected: [] };
          }
        }
      } else {
        return { type: 'invalid', selected: [] };
      }
    } else {
      const idx = parseInt(token, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= instances.length) {
        selectedIndices.add(idx - 1);
      } else {
        return { type: 'invalid', selected: [] };
      }
    }
  }

  if (selectedIndices.size === 0) {
    return { type: 'invalid', selected: [] };
  }

  const selected = Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .map(i => instances[i]);

  return { type: 'subset', selected };
}

function findMxcliBinary(mprPath) {
  const candidates = [
    path.join(toolsRootDir, 'bin', process.platform === 'win32' ? 'mxcli.exe' : 'mxcli'),
    ...(mprPath ? [path.join(path.dirname(mprPath), 'bin', process.platform === 'win32' ? 'mxcli.exe' : 'mxcli')] : [])
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  try {
    execSync('mxcli --version', { stdio: 'ignore' });
    return 'mxcli';
  } catch (e) {
    return null;
  }
}

function initializeMxcli(targetDir, mprPath, optionalBin, options = {}) {
  if (!targetDir || !fs.existsSync(targetDir)) return false;

  const mxcliBin = optionalBin || findMxcliBinary(mprPath);
  if (!mxcliBin) {
    console.log('[NOTICE] mxcli binary not found. Skipping mxcli init.');
    return false;
  }

  const aiContextDir = path.join(targetDir, '.ai-context');
  const dotMxcliDir = path.join(targetDir, '.mxcli');
  const agentsPath = path.join(targetDir, 'AGENTS.md');
  const claudePath = path.join(targetDir, 'CLAUDE.md');
  const isAlreadyInitialized = fs.existsSync(aiContextDir);

  // Preserve pre-existing custom headers (e.g. Orchestrator instructions) so mxcli init does not discard them
  let savedCustomAgentsHeader = '';
  let savedCustomClaudeHeader = '';
  if (!isAlreadyInitialized || options.forceFull) {
    if (fs.existsSync(agentsPath)) {
      const existing = fs.readFileSync(agentsPath, 'utf8');
      const cleaned = existing.replace(/# Menditect Architecture Setup[\s\S]*?(?=(?:\r?\n#[^#]|$))/, '').trim();
      if (cleaned && !cleaned.startsWith('# Mendix Project:')) {
        savedCustomAgentsHeader = cleaned;
      }
    }
    if (fs.existsSync(claudePath)) {
      const existing = fs.readFileSync(claudePath, 'utf8');
      const cleaned = existing.replace(/# Menditect Architecture Setup[\s\S]*?(?=(?:\r?\n#[^#]|$))/, '').trim();
      if (cleaned && !cleaned.startsWith('# Mendix Project:')) {
        savedCustomClaudeHeader = cleaned;
      }
    }
  }

  try {
    if (!isAlreadyInitialized || options.forceFull) {
      console.log(`\nInitializing Mendix AI scaffolding in ${targetDir}...`);
      execSync(`"${mxcliBin}" init "${targetDir}" --all-tools`, {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 45000
      });
      console.log(`[PASS] Initialized mxcli AI context and skills (.ai-context/skills/).`);

      // Restore saved custom headers if present
      if (savedCustomAgentsHeader && fs.existsSync(agentsPath)) {
        const generated = fs.readFileSync(agentsPath, 'utf8');
        if (!generated.includes(savedCustomAgentsHeader)) {
          fs.writeFileSync(agentsPath, savedCustomAgentsHeader + '\n\n' + generated, 'utf8');
        }
      }
      if (savedCustomClaudeHeader && fs.existsSync(claudePath)) {
        const generated = fs.readFileSync(claudePath, 'utf8');
        if (!generated.includes(savedCustomClaudeHeader)) {
          fs.writeFileSync(claudePath, savedCustomClaudeHeader + '\n\n' + generated, 'utf8');
        }
      }

      // Initialize brain if .mpr is available and docs/brain does not exist
      if (mprPath && fs.existsSync(mprPath)) {
        const brainDir = path.join(targetDir, 'docs', 'brain');
        if (!fs.existsSync(brainDir)) {
          try {
            execSync(`"${mxcliBin}" brain init -p "${mprPath}"`, {
              stdio: ['ignore', 'ignore', 'ignore'],
              timeout: 15000
            });
            console.log(`[PASS] Initialized project brain architecture store (docs/brain/).`);
          } catch (e) {}
        }
      }
    } else {
      console.log(`\nRefreshing Mendix AI skills in ${targetDir}...`);
      execSync(`"${mxcliBin}" init "${targetDir}" --sync-skills`, {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 30000
      });
      console.log(`[PASS] Refreshed mxcli AI skills via --sync-skills.`);
    }

    // Ensure local operational working directory .mxcli exists
    if (!fs.existsSync(dotMxcliDir)) {
      fs.mkdirSync(dotMxcliDir, { recursive: true });
    }

    return true;
  } catch (err) {
    console.warn(`[WARN] Could not complete mxcli initialization in ${targetDir}: ${err.message}`);
    return false;
  }
}

async function buildProjectCatalog(mprPath, optionalBin, options = {}) {
  if (!mprPath || !fs.existsSync(mprPath)) return false;

  const mxcliBin = optionalBin || findMxcliBinary(mprPath);
  if (!mxcliBin) {
    console.log('[NOTICE] mxcli binary not found. Skipping catalog build.');
    return false;
  }

  const projectDir = path.dirname(mprPath);
  const dotMxcliDir = path.join(projectDir, '.mxcli');
  const catalogDbPath = path.join(dotMxcliDir, 'catalog.db');

  if (!fs.existsSync(dotMxcliDir)) {
    try { fs.mkdirSync(dotMxcliDir, { recursive: true }); } catch (e) {}
  }

  console.log('\n--- Mendix Project Catalog Generation (.mxcli/catalog.db) ---');
  console.log('[INFO] The project catalog powers MTA test design, caller/callee analysis, and full-text code search.');
  console.log('[WARNING] Performance advisory: Compiling complete MDL source definitions (REFRESH CATALOG SOURCE)');
  console.log('          reads the contents of every document. On large projects (thousands of microflows/pages),');
  console.log('          this process can take multiple minutes or even up to 1 hour.');

  let choice = 'Y';
  if (options.askFn) {
    const promptText = '\nBuild project catalog with full MDL source now? [Y/n/fast] (Y = full with source, fast = structure only, n = skip)';
    const ans = await options.askFn(promptText, 'Y');
    choice = ans.trim() || 'Y';
  }

  const normalized = choice.toLowerCase();
  if (normalized.startsWith('n')) {
    console.log('[INFO] Catalog generation skipped.');
    console.log('[INFO] You can build it anytime by running:');
    console.log('       ./mxcli -c "REFRESH CATALOG SOURCE FORCE;"');
    return false;
  }

  let commandToRun = 'REFRESH CATALOG SOURCE FORCE;';
  let modeName = 'full source definitions (deep extraction)';
  if (normalized.startsWith('f')) {
    commandToRun = 'REFRESH CATALOG FULL FORCE;';
    modeName = 'structural metadata & activities (fast mode)';
  }

  console.log(`\nCompiling catalog in ${modeName}...`);
  console.log(`Executing: "${mxcliBin}" -p "${mprPath}" -c "${commandToRun}"\n`);

  return new Promise((resolve) => {
    const proc = spawn(mxcliBin, ['-p', mprPath, '-c', commandToRun], {
      stdio: 'inherit',
      shell: false
    });

    proc.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(catalogDbPath)) {
          const stats = fs.statSync(catalogDbPath);
          const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`\n[PASS] Catalog compiled successfully (${sizeMb} MB) at ${catalogDbPath}`);
        } else {
          console.log('\n[PASS] Catalog refresh command completed.');
        }
        resolve(true);
      } else {
        console.warn(`\n[WARN] Catalog build exited with code ${code}.`);
        console.warn(`       You can retry manually via: ./mxcli -c "${commandToRun}"`);
        resolve(false);
      }
    });

    proc.on('error', (err) => {
      console.warn(`\n[WARN] Failed to spawn mxcli for catalog refresh: ${err.message}`);
      resolve(false);
    });
  });
}

function inspectMendixMtaSettings(mprPath, optionalBin) {
  if (!mprPath || !fs.existsSync(mprPath)) return null;

  const mxcliBin = optionalBin || findMxcliBinary(mprPath);
  if (!mxcliBin) return null;

  try {
    const output = execSync(`"${mxcliBin}" describe settings Settings -p "${mprPath}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 25000
    });

    const configMap = new Map();

    // 1. Parse configuration blocks to capture HttpPortNumber / ApplicationRootUrl per configuration
    const configBlockRegex = /create or modify configuration '([^']+)'([\s\S]*?);/g;
    let cMatch;
    while ((cMatch = configBlockRegex.exec(output)) !== null) {
      const cfgName = cMatch[1];
      const body = cMatch[2];
      let port = null;
      const portMatch = body.match(/HttpPortNumber\s*=\s*(\d+)/);
      if (portMatch) {
        port = portMatch[1].trim();
      }

      let runtimeUrl = null;
      const rootUrlMatch = body.match(/ApplicationRootUrl\s*=\s*'([^']+)'/);
      if (rootUrlMatch && rootUrlMatch[1] && rootUrlMatch[1].trim()) {
        runtimeUrl = rootUrlMatch[1].trim();
      } else if (port) {
        runtimeUrl = `http://localhost:${port}/`;
      }

      let pluginUrl = null;
      if (runtimeUrl) {
        pluginUrl = runtimeUrl.replace(/\/+$/, '') + '/plugin/mcp';
      }

      configMap.set(cfgName, {
        name: cfgName,
        token: '',
        mtaUrl: null,
        runtimeUrl,
        pluginUrl,
        pluginToken: null,
        pluginPort: port || '8081'
      });
    }

    // 2. Parse alter settings constant ... in configuration '...'
    const constRegex = /alter settings constant '([^']+)'\s+value\s+'([^']*)'\s+in configuration '([^']+)';/g;
    let constMatch;
    while ((constMatch = constRegex.exec(output)) !== null) {
      const [_, constantName, rawVal, configName] = constMatch;
      const val = rawVal.trim();
      if (!configMap.has(configName)) {
        configMap.set(configName, {
          name: configName,
          token: '',
          mtaUrl: null,
          runtimeUrl: null,
          pluginUrl: null,
          pluginToken: null,
          pluginPort: '8081'
        });
      }
      const entry = configMap.get(configName);
      if (constantName.includes('ApplicationInstanceToken') && val) {
        entry.token = val;
      } else if (constantName.includes('MTAConnectionUrl') && val) {
        entry.mtaUrl = val.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
      } else if (constantName.includes('McpServerAccessToken') && val) {
        entry.pluginToken = formatBearerToken(val);
      }
    }

    // 3. Global fallbacks if not defined on a specific configuration
    let globalMtaUrl = null;
    const globalUrlMatch = output.match(/alter settings constant 'MtaPluginModule\.MTAConnectionUrl'\s+value\s+'([^']*)'/);
    if (globalUrlMatch && globalUrlMatch[1] && globalUrlMatch[1].trim()) {
      globalMtaUrl = globalUrlMatch[1].trim().replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
    }

    let globalPluginToken = null;
    const globalTokenMatch = output.match(/alter settings constant 'MtaPluginModule\.McpServerAccessToken'\s+value\s+'([^']*)'/);
    if (globalTokenMatch && globalTokenMatch[1] && globalTokenMatch[1].trim()) {
      globalPluginToken = formatBearerToken(globalTokenMatch[1].trim());
    }

    let globalPort = null;
    const globalPortMatch = output.match(/HttpPortNumber\s*=\s*(\d+)/);
    if (globalPortMatch && globalPortMatch[1]) {
      globalPort = globalPortMatch[1].trim();
    }

    let globalRuntimeUrl = null;
    let globalPluginUrl = null;
    const globalRootUrlMatch = output.match(/ApplicationRootUrl\s*=\s*'([^']+)'/);
    if (globalRootUrlMatch && globalRootUrlMatch[1] && globalRootUrlMatch[1].trim()) {
      globalRuntimeUrl = globalRootUrlMatch[1].trim();
      globalPluginUrl = globalRuntimeUrl.replace(/\/+$/, '') + '/plugin/mcp';
    }

    const instances = [];
    for (const entry of configMap.values()) {
      if (entry.token) {
        if (!entry.mtaUrl && globalMtaUrl) entry.mtaUrl = globalMtaUrl;
        if (!entry.pluginToken && globalPluginToken) entry.pluginToken = globalPluginToken;
        if (!entry.runtimeUrl && globalRuntimeUrl) entry.runtimeUrl = globalRuntimeUrl;
        if (!entry.pluginUrl && globalPluginUrl) entry.pluginUrl = globalPluginUrl;
        if (!entry.pluginPort && globalPort) entry.pluginPort = globalPort;
        instances.push(entry);
      }
    }

    return {
      instances,
      globalMtaUrl,
      globalPluginToken,
      globalRuntimeUrl,
      globalPluginUrl,
      globalPluginPort: globalPort
    };
  } catch (err) {
    return null;
  }
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

function generateIdeConfigs(workspaceDir, mcpSource, projectDir, mprPath, mtaUrl, appName, mtaAuthHeader, pluginToken, defaultInstanceToken) {
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

  // 2. VS Code .vscode/settings.json (merge terminal env vars, excluding sensitive tokens)
  const envVars = {
    "MENDIX_PROJECT_PATH": projectDir || "",
    "MENDIX_MPR_FILE": mprPath || "",
    "MENDIX_APP_NAME": appName || "",
    "MTA_BASE_URL": mtaUrl || "",
    "MTA_APP_INSTANCE_TOKEN": defaultInstanceToken || "",
    "MTA_OUTPUT_PATH": "${workspaceFolder}/menditect-output"
  };

  mergeJsonFile(path.join(workspaceDir, '.vscode', 'settings.json'), (existing) => {
    const cleanPlatformEnv = (orig) => {
      const merged = { ...(orig || {}), ...envVars };
      delete merged.MTA_MCP_AUTH_HEADER;
      delete merged.PLUGIN_MCP_TOKEN;
      return merged;
    };
    return {
      ...existing,
      "terminal.integrated.env.windows": cleanPlatformEnv(existing["terminal.integrated.env.windows"]),
      "terminal.integrated.env.linux": cleanPlatformEnv(existing["terminal.integrated.env.linux"]),
      "terminal.integrated.env.osx": cleanPlatformEnv(existing["terminal.integrated.env.osx"])
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
  if (!fs.existsSync(menditectOutputDir)) fs.mkdirSync(menditectOutputDir, { recursive: true });
  if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });
  console.log(`Ensured execution plan folder at:`);
  console.log(`  - ${plansDir}`);
  return { menditectOutputDir, plansDir };
}

function getMenditectSetupBlock(appName, mtaUrl, skillsStyle, appInstances = [], defaultInstanceName = '') {
  const instanceLines = [];
  if (appInstances && appInstances.length > 0) {
    instanceLines.push('- ** Application Instances for ExecuteTest: **');
    for (const inst of appInstances) {
      const isDefault = (inst.name === defaultInstanceName || appInstances.length === 1) ? ' (Default)' : '';
      instanceLines.push(`  - [${inst.name}]${isDefault}: \`${inst.token}\``);
    }
  }

  if (skillsStyle === 'mendix_module') {
    const lines = [
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
    ];
    if (instanceLines.length > 0) {
      lines.push(...instanceLines);
    }
    return lines.join('\n');
  }

  const lines = [
    '# Menditect Architecture Setup',
    '- **CRITICAL OPERATIONAL COMMAND:** Always execute tasks using the core rules defined in: [skills/AGENTS.md].',
    '- **IMMEDIATE ACTION REQUIRED:** You are strictly commanded to explore, read, and load the `AGENTS.md` and context of the `skills/` directory before answering any user prompt.',
    `- ** Application name is: [${appName}] **`,
    `- ** MTA Url: [${mtaUrl}] **`
  ];
  if (instanceLines.length > 0) {
    lines.push(...instanceLines);
  }
  return lines.join('\n');
}

function updateDirectiveFile(filePath, appName, mtaUrl, skillsStyle, appInstances, defaultInstanceName) {
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }
  const setupBlock = getMenditectSetupBlock(appName, mtaUrl, skillsStyle, appInstances, defaultInstanceName);

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

function updateAgentDirectives(targetDir, appName, mtaUrl, skillsStyle, appInstances, defaultInstanceName) {
  const targetFiles = [
    path.join(targetDir, 'AGENTS.md'),
    path.join(targetDir, 'CLAUDE.md'),
    path.join(targetDir, 'GEMINI.md'),
    path.join(targetDir, '.github', 'copilot-instructions.md')
  ];

  for (const file of targetFiles) {
    updateDirectiveFile(file, appName, mtaUrl, skillsStyle, appInstances, defaultInstanceName);
  }
  console.log(`Configured Menditect Architecture Setup in ${targetDir}`);
}

async function run(options = {}) {
  const skipSkills = options.skipSkills || process.argv.includes('--skip-skills') || process.argv.includes('--no-skills') || process.argv.includes('--skip-skills-sync');
  console.log('======================================================');
  console.log(` Menditect Agent Workspace Setup${scriptVersion}`);
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
      existingConfig = normalizeConfigAliases(JSON.parse(fs.readFileSync(existingConfigPath, 'utf8')));
    }
  } catch (e) {}

  // 1. Detailed breakdown of files & Git impact before choosing workspace
  console.log('Before choosing your workspace, review where files will be placed and how Git is affected:\n');

  console.log('[1] Dedicated Tools Workspace (Clone root: ' + toolsRootDir + ')');
  console.log('    - Placed in agentic-test-tools:');
  console.log('      * skills/ (MTA test design, build, and run skills)');
  console.log('      * .ai-context/skills/ (72+ Mendix AI skills initialized via mxcli init)');
  console.log('      * .mxcli/ (local operational queue for decisions and caching; git-ignored)');
  console.log('      * .vscode/, .cursor/, .claude/ IDE configuration files');
  console.log('      * AGENTS.md, CLAUDE.md, GEMINI.md');
  console.log('      * menditect-output/execution-plans/ (in-place plan updates tracked via Git)');
  console.log('      * bin/mxcli.exe and root ./mxcli runner scripts');
  console.log('    - Git Impact:');
  console.log('      * ZERO files created or modified in your Mendix project repository.');
  console.log('      * Keeps your Mendix project Git history completely untouched.\n');

  console.log('[2] Direct Mendix Project Workspace (Your local Mendix project folder)');
  console.log('    - Placed in your Mendix project:');
  console.log('      * Skills: skillssource/_modules/menditect_agentictestskills/ (if Mendix 11.12+ and module installed) or ./skills/');
  console.log('      * AI Scaffolding: .ai-context/skills/ (72+ Mendix AI skills initialized via mxcli init), docs/brain/');
  console.log('      * Local Working Directory: .mxcli/ (local staging queue; automatically added to .gitignore)');
  console.log('      * Directives: Appends Menditect Setup to project AGENTS.md (existing rules preserved)');
  console.log('      * IDE Configs: Merged into .vscode/, .cursor/, and .claude/ (preserves existing permissions)');
  console.log('      * Local Runners: mxcli.bat and ./mxcli deployed in project root');
  console.log('      * Execution Plans: menditect-output/execution-plans/ (in-place plan updates tracked via Git)');
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

  // 4. MTA Application Instances & Connection Settings
  console.log('\n--- MTA Connection & Application Instances ---');

  let discoveredMta = null;
  if (mprPath && fs.existsSync(mprPath)) {
    let mxcliBin = findMxcliBinary(mprPath);
    if (!mxcliBin) {
      console.log('mxcli binary not found. Downloading latest mxcli to inspect project settings...');
      try {
        const { syncMxcli } = require('./sync-upstream');
        const downloaded = await syncMxcli();
        if (downloaded) {
          mxcliBin = findMxcliBinary(mprPath);
        }
      } catch (e) {}
    }

    if (mxcliBin) {
      process.stdout.write('Checking Mendix project for configured MTA settings via mxcli... ');
      discoveredMta = inspectMendixMtaSettings(mprPath, mxcliBin);
      if (discoveredMta && discoveredMta.instances && discoveredMta.instances.length > 0) {
        console.log('done.');
      } else {
        console.log('none found.');
      }
    } else {
      console.log('[NOTICE] mxcli could not be downloaded or found. Skipping auto-discovery and falling back to manual entry.');
    }
  }

  let appInstances = [];
  let defaultInstanceName = '';
  let defaultInstanceToken = '';
  let activeConfig = null;

  if (discoveredMta && discoveredMta.instances && discoveredMta.instances.length > 0) {
    console.log(`\n[FOUND] Discovered ${discoveredMta.instances.length} App Instance Token(s) across Mendix project configurations:`);
    discoveredMta.instances.forEach((inst, idx) => {
      const previewToken = inst.token.length > 12 ? `${inst.token.slice(0, 8)}...${inst.token.slice(-4)}` : inst.token;
      const urlInfo = inst.mtaUrl ? ` -> MTA: ${inst.mtaUrl}` : '';
      console.log(`  [${idx + 1}] ${inst.name.padEnd(25)} (Token: ${previewToken})${urlInfo}`);
    });

    let selection = null;
    while (!selection || selection.type === 'invalid') {
      const choice = await ask('\nSelect instances to use (\'all\', comma-separated numbers e.g. 1,3,6, or \'none\')', 'all');
      selection = parseInstanceSelection(choice, discoveredMta.instances);
      if (selection.type === 'invalid') {
        if (rl && rl.closed) {
          selection = { type: 'all', selected: discoveredMta.instances };
          break;
        }
        console.log(`[NOTICE] Invalid selection. Enter 'all', 'none', or numbers between 1 and ${discoveredMta.instances.length}.`);
      }
    }

    if (selection.type === 'all' || selection.type === 'subset') {
      appInstances = selection.selected;

      if (appInstances.length === 1) {
        defaultInstanceName = appInstances[0].name;
        defaultInstanceToken = appInstances[0].token;
        activeConfig = appInstances[0];
        console.log(`Active default instance: [${defaultInstanceName}]`);
      } else {
        console.log('\nSelected application instances:');
        appInstances.forEach((inst, idx) => {
          const previewToken = inst.token.length > 12 ? `${inst.token.slice(0, 8)}...${inst.token.slice(-4)}` : inst.token;
          const urlInfo = inst.mtaUrl ? ` -> MTA: ${inst.mtaUrl}` : '';
          console.log(`  [${idx + 1}] ${inst.name.padEnd(25)} (Token: ${previewToken})${urlInfo}`);
        });

        const defaultSel = existingConfig.default_app_instance
          ? String(Math.max(1, appInstances.findIndex(x => x.name === existingConfig.default_app_instance) + 1 || 1))
          : '1';

        let selectionIdx = 1;
        const choice = await ask(`\nSelect active default instance for ExecuteTest (1-${appInstances.length})`, defaultSel);
        const parsed = parseInt(choice, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= appInstances.length) {
          selectionIdx = parsed;
        }
        defaultInstanceName = appInstances[selectionIdx - 1].name;
        defaultInstanceToken = appInstances[selectionIdx - 1].token;
        activeConfig = appInstances[selectionIdx - 1];
        console.log(`Active default instance: [${defaultInstanceName}]`);
      }
    }
  }

  // Fallback to manual prompt if no instances discovered or accepted
  if (!appInstances.length) {
    const existingInstances = existingConfig.app_instances || [];
    const defaultCount = existingInstances.length ? String(existingInstances.length) : '1';
    console.log('\nConfigure application instances (required for ExecuteTest, e.g. local, test, acceptance):');
    const rawCount = await ask('How many MTA application instances do you have?', defaultCount);
    const count = Math.max(1, parseInt(rawCount, 10) || 1);

    for (let i = 1; i <= count; i++) {
      const existingInst = existingInstances[i - 1];
      const defaultName = existingInst ? existingInst.name : (i === 1 ? 'local' : (i === 2 ? 'test' : `instance-${i}`));
      const instName = await ask(`Instance #${i} name (e.g. local, test)`, defaultName);

      let token = '';
      const defaultToken = existingInst ? existingInst.token : (i === 1 ? (existingConfig.default_app_instance_token || '') : '');
      while (!token) {
        token = await ask(`Instance #${i} token (from MTA Portal > Application > Application Instances)`, defaultToken);
        token = token.trim();
        if (!token) {
          if (rl.closed) {
            token = '00000000-0000-0000-0000-000000000000';
            break;
          }
          console.log('[ERROR] Application instance token cannot be empty.');
        }
      }

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
        console.log('[NOTICE] Token does not match standard UUID format, but will be used as entered.');
      }

      appInstances.push({ name: instName, token });
    }

    let selIdx = 1;
    if (appInstances.length > 1) {
      const defaultSel = existingConfig.default_app_instance
        ? String(appInstances.findIndex(x => x.name === existingConfig.default_app_instance) + 1 || 1)
        : '1';
      const choice = await ask(`Select active default instance for ExecuteTest (1-${appInstances.length})`, defaultSel);
      const parsed = parseInt(choice, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= appInstances.length) {
        selIdx = parsed;
      }
    }
    defaultInstanceName = appInstances[selIdx - 1].name;
    defaultInstanceToken = appInstances[selIdx - 1].token;
  }

  console.log('\n--- MTA Connection Settings ---');
  const defaultMtaUrl = activeConfig?.mtaUrl || discoveredMta?.globalMtaUrl || existingConfig.mta_base_url || 'https://mta-trial.mendixcloud.com';
  const mtaUrl = await ask('MTA URL', defaultMtaUrl);
  const mcpEndpoint = mtaUrl.replace(/\/$/, '') + '/primitivetools/mcp';

  const defaultMtaToken = process.env.MTA_MCP_AUTH_HEADER || existingConfig.mta_auth_header || '';
  const rawMtaToken = await ask('MTA Bearer Token (e.g. Bearer <token> or raw token)', defaultMtaToken);
  const mtaAuthHeader = formatBearerToken(rawMtaToken);
  
  const defaultPluginUrl = activeConfig?.pluginUrl
    || (discoveredMta?.globalPluginUrl)
    || (activeConfig?.pluginPort ? `http://localhost:${activeConfig.pluginPort}/plugin/mcp` : null)
    || (discoveredMta?.globalPluginPort ? `http://localhost:${discoveredMta.globalPluginPort}/plugin/mcp` : null)
    || existingConfig.plugin_mcp_url
    || 'http://localhost:8081/plugin/mcp';
  const pluginUrl = await ask('App under test Plugin URL', defaultPluginUrl);

  const defaultPluginToken = process.env.PLUGIN_MCP_TOKEN || activeConfig?.pluginToken || discoveredMta?.globalPluginToken || existingConfig.plugin_mcp_token || 'Bearer 1';
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

  // 5. Ensure Execution Plans Storage Folder
  const { menditectOutputDir, plansDir } = ensureExecutionPlanFolders(workspaceDir);

  // 6. Save Configuration to mta_config.json (tokens stored in .env to prevent credential leakage)
  const sanitizedInstances = appInstances.map(inst => {
    const item = {
      name: inst.name,
      token: inst.token
    };
    if (inst.mtaUrl && typeof inst.mtaUrl === 'string') item.mtaUrl = inst.mtaUrl;
    if (inst.runtimeUrl && typeof inst.runtimeUrl === 'string') item.runtimeUrl = inst.runtimeUrl;
    if (inst.pluginUrl && typeof inst.pluginUrl === 'string') item.pluginUrl = inst.pluginUrl;
    if (inst.pluginToken && typeof inst.pluginToken === 'string') item.pluginToken = inst.pluginToken;
    if (inst.pluginPort) item.pluginPort = String(inst.pluginPort);
    return item;
  });

  const config = {
    $schema: './mta_config.schema.json',
    workspace_type: workspaceType,
    workspace_dir: workspaceDir,
    skills_dir: skillsDir,
    skills_style: skillsStyle,
    mta_output_path: menditectOutputDir,
    execution_plans_dir: plansDir,
    mendix_version: detectedVersion || '',
    application_name: appName,
    mta_base_url: mtaUrl,
    mcp_endpoint: mcpEndpoint,
    plugin_mcp_url: pluginUrl,
    app_instances: sanitizedInstances,
    default_app_instance: defaultInstanceName,
    default_app_instance_token: defaultInstanceToken,
    model_source: mcpSource,
    mendix_project_dir: projectDir,
    mendix_mpr_path: mprPath
  };

  fs.writeFileSync(path.join(toolsRootDir, 'mta_config.json'), JSON.stringify(config, null, 2));
  console.log('\nCreated / updated mta_config.json (secrets decoupled to .env)');

  // Also write mta_config.json and copy schema to workspaceDir if different from toolsRootDir for local reference
  if (path.resolve(workspaceDir) !== path.resolve(toolsRootDir)) {
    try {
      fs.writeFileSync(path.join(workspaceDir, 'mta_config.json'), JSON.stringify(config, null, 2));
      const schemaSource = path.join(toolsRootDir, 'mta_config.schema.json');
      if (fs.existsSync(schemaSource)) {
        fs.copyFileSync(schemaSource, path.join(workspaceDir, 'mta_config.schema.json'));
      }
    } catch (e) {}
  }

  // 7. Ensure .gitignore protects credentials and write .env in workspace
  ensureGitIgnoreEntries(workspaceDir, ['.env', '.env.local']);
  if (path.resolve(workspaceDir) !== path.resolve(toolsRootDir)) {
    ensureGitIgnoreEntries(toolsRootDir, ['.env', '.env.local']);
  }

  let envContent = `MTA_MCP_ENDPOINT="${mcpEndpoint}"
MTA_MCP_AUTH_HEADER="${mtaAuthHeader}"
PLUGIN_MCP_URL="${pluginUrl}"
PLUGIN_MCP_TOKEN="${pluginToken}"
MENDIX_PROJECT_DIR="${projectDir}"
MENDIX_MPR_PATH="${mprPath}"
MENDIX_APP_NAME="${appName}"
MTA_OUTPUT_PATH="${menditectOutputDir.replace(/\\/g, '/')}"
MTA_APP_INSTANCE_TOKEN="${defaultInstanceToken}"
MTA_APP_INSTANCE_DEFAULT="${defaultInstanceName}"
`;

  for (const inst of appInstances) {
    const safeEnvName = inst.name.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
    envContent += `MTA_APP_INSTANCE_${safeEnvName}="${inst.token}"\n`;
  }

  try {
    fs.writeFileSync(path.join(workspaceDir, '.env'), envContent, { mode: 0o600 });
  } catch (e) {
    fs.writeFileSync(path.join(workspaceDir, '.env'), envContent);
  }
  console.log(`Created .env in ${workspaceDir}`);

  // 8. Synchronize Menditect Agentic Test Skills from upstream (agentic-test-skills)
  let skillsSyncSuccess = false;
  if (skipSkills) {
    console.log('\n[NOTICE] Skipping skills synchronization (--skip-skills specified).');
  } else {
    console.log('\n--- Menditect Agentic Test Skills Synchronization ---');
    try {
      const { syncSkills } = require('./sync-upstream');
      skillsSyncSuccess = await syncSkills({ config });
      if (skillsSyncSuccess) {
        console.log(`[PASS] Upstream skills synchronized successfully into ${skillsDir}.`);
      } else {
        console.warn(`[WARN] Skills synchronization did not complete. You can run "npm run update:skills" later.`);
      }
    } catch (err) {
      console.warn(`[WARN] Could not automatically sync skills: ${err.message}`);
      console.warn(`       You can sync skills manually later via "npm run update:skills".`);
    }
  }

  // 9. Initialize Mendix AI Scaffolding (mxcli init, .ai-context/skills, docs/brain, .mxcli)
  if (workspaceChoice === '1') {
    initializeMxcli(toolsRootDir, mprPath, null, { isMendixProject: false });
    if (projectDir && fs.existsSync(projectDir) && path.resolve(projectDir) !== path.resolve(toolsRootDir)) {
      const initProject = await ask('\nAlso initialize external Mendix project repository with mxcli init? (y/n)', 'n');
      if (initProject.toLowerCase().startsWith('y')) {
        initializeMxcli(projectDir, mprPath, null, { isMendixProject: true });
      }
    }
  } else if (workspaceChoice === '2') {
    initializeMxcli(workspaceDir, mprPath, null, { isMendixProject: true });
  } else {
    initializeMxcli(workspaceDir, mprPath, null, { isMendixProject: false });
  }

  // 10. Generate & Merge IDE Configs
  generateIdeConfigs(workspaceDir, mcpSource, projectDir, mprPath, mtaUrl, appName, mtaAuthHeader, pluginToken, defaultInstanceToken);

  // 11. Deploy local mxcli runners into workspace
  const mprFileName = mprPath ? path.basename(mprPath) : '';
  deployMxcliWrappers(workspaceDir, mprFileName);

  // 12. Build Mendix Project Catalog (catalog.db) for MTA test automation & code search
  if (mprPath && fs.existsSync(mprPath)) {
    await buildProjectCatalog(mprPath, null, { askFn: ask });
  }

  // 13. Update Agent Directives in workspaceDir
  updateAgentDirectives(workspaceDir, appName, mtaUrl, skillsStyle, appInstances, defaultInstanceName);

  console.log('\n======================================================');
  console.log(' Setup completed successfully!');
  console.log(` Workspace configured at: ${workspaceDir}`);
  console.log(` Skills destination:      ${skillsDir}`);
  if (!skipSkills) {
    console.log(` Skills status:           ${skillsSyncSuccess ? 'Synchronized from agentic-test-skills' : 'Pending (run npm run update:skills)'}`);
  }
  console.log(` Active App Instance:     ${defaultInstanceName}`);
  console.log(` App Instances Total:     ${appInstances.length}`);
  console.log(` Execution plans:         ${plansDir}`);
  console.log(' Your workspace is ready! Run "npm run verify" to check MCP connectivity.');
  console.log(' (Run "npm run update" in the future to refresh skills and binaries).');
  console.log('======================================================');
  if (rl) rl.close();
}

function runDirectivesOnly() {
  const rootConfigPath = path.join(toolsRootDir, 'mta_config.json');
  let config = {};
  if (fs.existsSync(rootConfigPath)) {
    try {
      config = JSON.parse(fs.readFileSync(rootConfigPath, 'utf8'));
    } catch (e) {}
  }
  if (normalizeConfigAliases) {
    config = normalizeConfigAliases(config);
  }

  const workspaceDir = config.workspace_dir || toolsRootDir;
  const wsConfigPath = path.join(workspaceDir, 'mta_config.json');
  if (fs.existsSync(wsConfigPath) && path.resolve(wsConfigPath) !== path.resolve(rootConfigPath)) {
    try {
      const wsConfig = JSON.parse(fs.readFileSync(wsConfigPath, 'utf8'));
      config = { ...config, ...(normalizeConfigAliases ? normalizeConfigAliases(wsConfig) : wsConfig) };
    } catch (e) {}
  }

  const appName = config.application_name || 'MyApp';
  const mtaUrl = config.mta_base_url || 'https://mta-trial.mendixcloud.com';
  const skillsStyle = config.skills_style || 'standard';
  const appInstances = config.app_instances || [];
  const defaultInstanceName = config.default_app_instance || '';

  console.log(`[RESTORE] Restoring Menditect Architecture Setup directives in ${workspaceDir}...`);
  updateAgentDirectives(workspaceDir, appName, mtaUrl, skillsStyle, appInstances, defaultInstanceName);
  if (path.resolve(workspaceDir) !== path.resolve(toolsRootDir)) {
    updateAgentDirectives(toolsRootDir, appName, mtaUrl, skillsStyle, appInstances, defaultInstanceName);
  }
  console.log(`[PASS] Agent directives successfully restored across AGENTS.md, CLAUDE.md, and GEMINI.md.`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--directives-only') || args.includes('--directives')) {
    runDirectivesOnly();
  } else {
    const skipSkills = args.includes('--skip-skills') || args.includes('--no-skills') || args.includes('--skip-skills-sync');
    run({ skipSkills });
  }
} else {
  module.exports = {
    parseInstanceSelection,
    inspectMendixMtaSettings,
    findMxcliBinary,
    initializeMxcli,
    buildProjectCatalog,
    updateAgentDirectives,
    getMenditectSetupBlock,
    formatBearerToken,
    findMpr,
    detectMendixVersion,
    isVersion1112OrHigher,
    normalizeConfigAliases,
    ensureExecutionPlanFolders,
    runDirectivesOnly,
    run
  };
}
