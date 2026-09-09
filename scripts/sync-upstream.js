const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const rootDir = path.join(__dirname, '..');
const defaultBinDir = path.join(rootDir, 'bin');

function loadConfig() {
  const possiblePaths = [
    process.env.MTA_CONFIG_PATH,
    path.join(rootDir, 'mta_config.json'),
    path.join(process.cwd(), 'mta_config.json')
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (e) {}
    }
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(path.join(rootDir, 'mta_config.json'), JSON.stringify(config, null, 2), 'utf8');
    if (config.workspace_dir && path.resolve(config.workspace_dir) !== path.resolve(rootDir)) {
      fs.writeFileSync(path.join(config.workspace_dir, 'mta_config.json'), JSON.stringify(config, null, 2), 'utf8');
    }
  } catch (e) {}
}

function apiRequest(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'Menditect-Workspace-Setup' }
    };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return apiRequest(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'Menditect-Workspace-Setup' } };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
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

function updateDirectives(targetDir, appName, mtaUrl, skillsStyle) {
  const targetFiles = [
    path.join(targetDir, 'AGENTS.md'),
    path.join(targetDir, 'CLAUDE.md'),
    path.join(targetDir, 'GEMINI.md'),
    path.join(targetDir, '.github', 'copilot-instructions.md')
  ];

  const setupBlock = getMenditectSetupBlock(appName, mtaUrl, skillsStyle);
  const headerRegex = /# Menditect Architecture Setup[\s\S]*?(?=(?:\r?\n#[^#]|$))/;

  for (const filePath of targetFiles) {
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }
    if (headerRegex.test(content)) {
      content = content.replace(headerRegex, setupBlock + '\n');
    } else {
      content = content.trimEnd() ? (content.trimEnd() + '\n\n' + setupBlock + '\n') : (setupBlock + '\n');
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

async function syncSkills() {
  const config = loadConfig();
  let targetSkillsDir = config.skills_dir || path.join(rootDir, 'skills');
  const workspaceDir = config.workspace_dir || rootDir;

  // Ensure execution-plans and archive folders exist in workspace (menditect-output/execution-plans)
  const menditectOutputDir = config.mta_output_path || path.join(workspaceDir, 'menditect-output');
  const plansDir = config.execution_plans_dir || path.join(menditectOutputDir, 'execution-plans');
  const archiveDir = config.execution_plans_archive_dir || path.join(plansDir, 'archive');
  if (!fs.existsSync(menditectOutputDir)) fs.mkdirSync(menditectOutputDir, { recursive: true });
  if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

  // Check if Marketplace module was recently added and offer/perform automatic migration (requires Mendix 11.12+)
  if (config.workspace_type === 'mendix_project' && config.skills_style === 'standard') {
    const is1112Plus = !config.mendix_version || (() => {
      const parts = config.mendix_version.split('.').map(n => parseInt(n, 10));
      return (parts[0] > 11) || (parts[0] === 11 && (parts[1] || 0) >= 12);
    })();

    if (is1112Plus) {
      const candidateModule = path.join(workspaceDir, 'skillssource', '_modules', 'menditect_agentictestskills');
      if (fs.existsSync(candidateModule) && fs.statSync(candidateModule).isDirectory()) {
        console.log(`\n[MIGRATION] Detected Menditect_AgenticTestSkills module at:`);
        console.log(`            ${path.relative(workspaceDir, candidateModule)}`);
        console.log('Migrating skills from project-level ./skills/ into module...');

        targetSkillsDir = candidateModule;
        config.skills_dir = candidateModule;
        config.skills_style = 'mendix_module';
        saveConfig(config);

        // Clean up legacy skills directory if it exists
        const oldSkillsDir = path.join(workspaceDir, 'skills');
        if (fs.existsSync(oldSkillsDir) && path.resolve(oldSkillsDir) !== path.resolve(candidateModule)) {
          try { fs.rmSync(oldSkillsDir, { recursive: true, force: true }); } catch (e) {}
        }

        // Update project directives to explore the module
        updateDirectives(workspaceDir, config.application_name || 'MyApp', config.mta_base_url || 'https://mta-trial.mendixcloud.com', 'mendix_module');
        console.log('Updated project AGENTS.md to explore [Menditect_AgenticTestSkills].');
      }
    }
  }

  console.log(`Syncing skills from Menditect/agentic-test-skills into ${targetSkillsDir}...`);
  const tmpDir = path.join(os.tmpdir(), 'agentic-test-skills-tmp-' + Date.now());
  try {
    execSync(`git clone --depth 1 https://github.com/Menditect/agentic-test-skills.git "${tmpDir}"`, { stdio: 'ignore' });
    
    const sourceSkillsDir = path.join(tmpDir, 'AgenticTestSkills');
    if (fs.existsSync(sourceSkillsDir)) {
      if (!fs.existsSync(targetSkillsDir)) fs.mkdirSync(targetSkillsDir, { recursive: true });
      
      if (process.platform === 'win32') {
        execSync(`xcopy /E /I /Y "${sourceSkillsDir}\\*" "${targetSkillsDir}\\"`, { stdio: 'ignore' });
      } else {
        execSync(`cp -R "${sourceSkillsDir}/"* "${targetSkillsDir}/"`, { stdio: 'ignore' });
      }
      console.log(`Skills synced successfully into ${targetSkillsDir}`);
    } else {
      console.log('AgenticTestSkills directory not found in repository.');
    }
  } catch (err) {
    console.error('Failed to sync skills (is git installed?):', err.message);
  } finally {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch(e) {}
  }
}

async function syncMxcli() {
  const config = loadConfig();
  const workspaceDir = config.workspace_dir || rootDir;

  if (!fs.existsSync(defaultBinDir)) fs.mkdirSync(defaultBinDir, { recursive: true });

  console.log('Fetching latest mxcli release from mendixlabs/mxcli...');
  try {
    const release = await apiRequest('https://api.github.com/repos/mendixlabs/mxcli/releases/latest');
    console.log(`Found mxcli ${release.tag_name}`);
    
    let assetName = '';
    const platform = process.platform;
    const arch = process.arch;
    
    if (platform === 'win32') {
      assetName = arch === 'arm64' ? 'mxcli-windows-arm64.exe' : 'mxcli-windows-amd64.exe';
    } else if (platform === 'darwin') {
      assetName = arch === 'arm64' ? 'mxcli-darwin-arm64' : 'mxcli-darwin-amd64';
    } else {
      assetName = arch === 'arm64' ? 'mxcli-linux-arm64' : 'mxcli-linux-amd64';
    }
    
    const asset = release.assets.find(a => a.name === assetName);
    if (!asset) {
      console.log(`No mxcli binary found for ${platform} ${arch}`);
      return;
    }
    
    const finalBinName = platform === 'win32' ? 'mxcli.exe' : 'mxcli';
    const binaryPath = path.join(defaultBinDir, finalBinName);
    
    console.log(`Downloading ${asset.browser_download_url}...`);
    await downloadFile(asset.browser_download_url, binaryPath);
    
    if (platform !== 'win32') {
      if (fs.existsSync(binaryPath)) {
        fs.chmodSync(binaryPath, 0o755);
        console.log('Applied chmod +x to mxcli.');
      }
    }
    console.log(`mxcli updated successfully in ${defaultBinDir}`);

    // If workspace is separate, ensure workspace bin directory also has the binary
    if (path.resolve(workspaceDir) !== path.resolve(rootDir)) {
      const workspaceBinDir = path.join(workspaceDir, 'bin');
      if (!fs.existsSync(workspaceBinDir)) fs.mkdirSync(workspaceBinDir, { recursive: true });
      const targetBinaryPath = path.join(workspaceBinDir, finalBinName);
      fs.copyFileSync(binaryPath, targetBinaryPath);
      if (platform !== 'win32') {
        try { fs.chmodSync(targetBinaryPath, 0o755); } catch (e) {}
      }
      console.log(`Copied mxcli binary to ${workspaceBinDir}`);
    }
  } catch (err) {
    console.error('Failed to update mxcli:', err.message);
  }
}

async function run() {
  console.log('NOTICE: This tooling is vibe-coded and provided "AS IS" without official support.\n');
  const target = process.argv[2] || 'all';
  if (target === 'skills') {
    await syncSkills();
  } else if (target === 'mxcli') {
    await syncMxcli();
  } else {
    await syncSkills();
    await syncMxcli();
  }
}

module.exports = { syncSkills, syncMxcli };

if (require.main === module) {
  run();
}
