const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const proxyPath = path.join(__dirname, 'mta-proxy.js');
const rootDir = path.join(__dirname, '..');
const configPath = path.join(rootDir, 'mta_config.json');

let scriptVersion = '';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  if (pkg.version) scriptVersion = ` (v${pkg.version})`;
} catch (e) {}

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

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(rootDir, '.env.local'));
loadEnvFile(path.join(rootDir, '.env'));

let rawConfig = {};
try {
  if (fs.existsSync(configPath)) {
    rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {}

const { normalizeConfigAliases } = require('./setup');
const config = normalizeConfigAliases ? normalizeConfigAliases(rawConfig) : rawConfig;

function validateConfigAgainstSchema(cfg) {
  const schemaPath = path.join(__dirname, '..', 'mta_config.schema.json');
  if (!fs.existsSync(schemaPath)) {
    return { valid: true, errors: [] };
  }
  let schema = {};
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (e) {
    return { valid: false, errors: ['Failed to parse mta_config.schema.json'] };
  }

  const errors = [];
  const required = schema.required || ['mta_base_url', 'mcp_endpoint'];
  for (const req of required) {
    if (!cfg[req] || (typeof cfg[req] === 'string' && !cfg[req].trim())) {
      errors.push(`Missing required property: '${req}'`);
    }
  }

  if (cfg.workspace_type && !['clone_root', 'mendix_project', 'custom'].includes(cfg.workspace_type)) {
    errors.push(`Invalid workspace_type: '${cfg.workspace_type}' (expected: clone_root, mendix_project, or custom)`);
  }

  if (cfg.skills_style && !['standard', 'mendix_module'].includes(cfg.skills_style)) {
    errors.push(`Invalid skills_style: '${cfg.skills_style}' (expected: standard or mendix_module)`);
  }

  if (cfg.model_source && !['mxcli', 'studiopro'].includes(cfg.model_source)) {
    errors.push(`Invalid model_source: '${cfg.model_source}' (expected: mxcli or studiopro)`);
  }

  if (cfg.app_instances) {
    if (!Array.isArray(cfg.app_instances)) {
      errors.push(`'app_instances' must be an array`);
    } else {
      cfg.app_instances.forEach((inst, idx) => {
        if (!inst || typeof inst !== 'object') {
          errors.push(`app_instances[${idx}] must be an object`);
        } else {
          if (!inst.name || typeof inst.name !== 'string') {
            errors.push(`app_instances[${idx}] missing required string 'name'`);
          }
          if (!inst.token || typeof inst.token !== 'string') {
            errors.push(`app_instances[${idx}] missing required string 'token'`);
          }
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

function checkSchemaContractAlignment() {
  const localSchemaPath = path.join(rootDir, 'mta_config.schema.json');
  if (!fs.existsSync(localSchemaPath)) return true;
  let localSchema;
  try {
    localSchema = JSON.parse(fs.readFileSync(localSchemaPath, 'utf8'));
  } catch (e) {
    return true;
  }
  const localVersion = localSchema.version;

  const candidateUpstreams = [
    { name: 'agentic-test-skills (local skills/mta-build)', path: path.join(rootDir, 'skills', 'mta-build', 'references', 'mta_config.schema.json') },
    { name: 'agentic-test-skills repository', path: path.join(rootDir, '..', 'agentic-test-skills', 'AgenticTestSkills', 'mta-build', 'references', 'mta_config.schema.json') }
  ];

  for (const candidate of candidateUpstreams) {
    if (fs.existsSync(candidate.path)) {
      try {
        const upstream = JSON.parse(fs.readFileSync(candidate.path, 'utf8'));
        if (upstream.version && localVersion !== upstream.version) {
          console.warn(`[WARN] Contract version mismatch: mta_config.schema.json is v${localVersion}, but ${candidate.name} is v${upstream.version}!`);
          console.warn(`       mta_config contract version must match agentic-test-skills. Run "npm run update:skills" to align.`);
          return false;
        } else if (upstream.version) {
          console.log(`[PASS] mta_config schema contract (v${localVersion}) is aligned with ${candidate.name}.`);
          return true;
        }
      } catch (e) {}
    }
  }
  console.log(`[INFO] mta_config schema contract version is v${localVersion}.`);
  return true;
}

function checkMxcliBinary() {
  const toolsRootDir = path.join(__dirname, '..');
  const binName = process.platform === 'win32' ? 'mxcli.exe' : 'mxcli';
  const binPath = path.join(toolsRootDir, 'bin', binName);

  if (!fs.existsSync(binPath)) {
    console.warn(`[WARN] mxcli binary not found at ${binPath}. Run "npm run update:mxcli" to install it.`);
    return false;
  }

  try {
    const versionOut = require('child_process').execSync(`"${binPath}" --version`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000
    }).trim();
    console.log(`[PASS] mxcli binary is ready (${versionOut}).`);

    // Check if mxcli AI scaffolding (.ai-context) is initialized
    const targetDir = config.workspace_dir || toolsRootDir;
    const aiContextPath = path.join(targetDir, '.ai-context');
    const dotMxcliPath = path.join(targetDir, '.mxcli');
    if (fs.existsSync(aiContextPath)) {
      console.log(`[PASS] mxcli AI scaffolding is initialized (.ai-context/skills/).`);
    } else {
      console.log(`[NOTICE] mxcli AI scaffolding not initialized in ${targetDir}. Run "npm run setup" to initialize skills and context.`);
    }
    if (fs.existsSync(dotMxcliPath)) {
      console.log(`[PASS] Local mxcli working directory is present (.mxcli/).`);
    }

    // Check if Mendix project catalog (.mxcli/catalog.db) is populated
    const mendixDir = config.mendix_project_dir || (config.mendix_mpr_path ? path.dirname(config.mendix_mpr_path) : null);
    if (mendixDir) {
      const catalogDbPath = path.join(mendixDir, '.mxcli', 'catalog.db');
      if (fs.existsSync(catalogDbPath)) {
        try {
          const stats = fs.statSync(catalogDbPath);
          if (stats.size > 0) {
            const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
            const mtime = stats.mtime.toISOString().replace('T', ' ').substring(0, 19);
            console.log(`[PASS] Mendix project catalog is active (.mxcli/catalog.db, ${sizeMb} MB, modified ${mtime}).`);
          } else {
            console.warn(`[WARN] Mendix project catalog exists but is empty (0 bytes) at ${catalogDbPath}.`);
            console.warn(`       MTA test analysis and code search require the project catalog.`);
            console.warn(`       To populate: ./mxcli -c "REFRESH CATALOG SOURCE FORCE;"`);
            console.warn(`       (Note: On large projects, source extraction may take multiple minutes to 1 hour).`);
          }
        } catch (e) {
          console.warn(`[WARN] Unable to inspect catalog.db: ${e.message}`);
        }
      } else {
        console.warn(`[WARN] Mendix project catalog is not built (.mxcli/catalog.db not found in ${mendixDir}).`);
        console.warn(`       MTA test analysis and code search require the project catalog.`);
        console.warn(`       To generate: ./mxcli -c "REFRESH CATALOG SOURCE FORCE;"`);
        console.warn(`       (Note: On large projects, source extraction may take multiple minutes to 1 hour).`);
      }
    }

    return true;
  } catch (e) {
    console.warn(`[WARN] mxcli binary present at ${binPath} but failed execution check: ${e.message}`);
    return false;
  }
}

function checkTokenPreflight(mode) {
  if (mode === 'mta') {
    const hasToken = process.env.MTA_MCP_AUTH_HEADER || (process.env.MTA_MCP_TOKEN ? `Bearer ${process.env.MTA_MCP_TOKEN}` : null) || (config.mta_auth_header && config.mta_auth_header.trim());
    if (!hasToken) {
      console.warn('[WARN] No MTA Bearer token configured in .env or MTA_MCP_AUTH_HEADER. MTA MCP requires authentication.');
    } else {
      console.log('[INFO] MTA Bearer token is configured.');
    }
  } else if (mode === 'plugin') {
    const hasToken = process.env.PLUGIN_MCP_TOKEN || (config.plugin_mcp_token && config.plugin_mcp_token.trim());
    if (!hasToken) {
      console.warn('[WARN] No Plugin token configured in .env or PLUGIN_MCP_TOKEN (recommended: Bearer <token>).');
    } else {
      console.log('[INFO] Plugin token is configured.');
    }
  } else if (mode === 'studiopro') {
    console.log('[INFO] Studio Pro MCP does not require authentication.');
  }
}

function checkSecurityHygiene() {
  console.log('Checking secret storage and security hygiene...');
  const wsDir = config.workspace_dir || rootDir;

  // 1. Check .vscode/settings.json
  const settingsPath = path.join(wsDir, '.vscode', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settingsContent = fs.readFileSync(settingsPath, 'utf8');
      if (settingsContent.includes('MTA_MCP_AUTH_HEADER') || settingsContent.includes('PLUGIN_MCP_TOKEN')) {
        console.warn('  [WARN] Sensitive tokens detected in .vscode/settings.json! Run "npm run setup" to migrate them to .env and clean settings.json.');
      } else {
        console.log('  [PASS] .vscode/settings.json contains no sensitive tokens.');
      }
    } catch (e) {}
  }

  // 2. Check .env gitignore status
  const envPath = path.join(wsDir, '.env');
  const gitIgnorePath = path.join(wsDir, '.gitignore');
  if (fs.existsSync(envPath)) {
    if (fs.existsSync(gitIgnorePath)) {
      const gitIgnoreContent = fs.readFileSync(gitIgnorePath, 'utf8');
      const lines = gitIgnoreContent.split(/\r?\n/).map(l => l.trim());
      const hasEnv = lines.some(l => l === '.env' || l === '*.env' || l.startsWith('.env'));
      if (hasEnv) {
        console.log('  [PASS] .env is properly protected by .gitignore.');
      } else {
        console.warn('  [WARN] .env exists in workspace but is NOT ignored in .gitignore! Add .env to .gitignore to prevent accidental commit.');
      }
    } else {
      console.warn('  [WARN] .env exists in workspace but no .gitignore found! Ensure credentials are not committed.');
    }
  }

  // 3. Check mta_config.json legacy tokens
  if (rawConfig.mta_auth_header || rawConfig.plugin_mcp_token) {
    console.log('  [INFO] mta_config.json contains legacy auth tokens. Run "npm run setup" to decouple secrets to .env.');
  } else {
    console.log('  [PASS] mta_config.json contains no hardcoded authentication tokens.');
  }
}

function checkPublicBoundaryHygiene() {
  console.log('Checking public boundary hygiene and upstream attribution...');
  const forbiddenPatterns = [
    { term: 'mta-ai-assistant', desc: 'Internal skills build repository reference' },
    { term: 'mta_ai_assistant', desc: 'Internal skills build repository identifier' }
  ];

  const targetScanDirs = ['releases', 'docs'];
  const targetScanFiles = ['README.md', 'mta_config.schema.json', 'package.json'];
  const violations = [];

  for (const dirName of targetScanDirs) {
    const dirPath = path.join(rootDir, dirName);
    if (!fs.existsSync(dirPath)) continue;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(dirPath, entry.name);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split(/\r?\n/);
          lines.forEach((line, idx) => {
            for (const pat of forbiddenPatterns) {
              if (line.toLowerCase().includes(pat.term)) {
                violations.push({
                  file: path.relative(rootDir, filePath),
                  line: idx + 1,
                  desc: pat.desc,
                  snippet: line.trim()
                });
              }
            }
          });
        } catch (e) {}
      }
    }
  }

  for (const fileName of targetScanFiles) {
    const filePath = path.join(rootDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        for (const pat of forbiddenPatterns) {
          if (line.toLowerCase().includes(pat.term)) {
            violations.push({
              file: fileName,
              line: idx + 1,
              desc: pat.desc,
              snippet: line.trim()
            });
          }
        }
      });
    } catch (e) {}
  }

  if (violations.length === 0) {
    console.log('  [PASS] All public release notes, docs, and schemas correctly attribute official upstream "agentic-test-skills".');
    return true;
  } else {
    console.error('  [FAIL] Public Boundary Violation: Reference to internal build repository detected:');
    for (const v of violations) {
      console.error(`    - ${v.file}:${v.line} [${v.desc}] -> "${v.snippet}"`);
    }
    console.error('  Official upstream repository is "agentic-test-skills". Please fix before releasing.\n');
    return false;
  }
}

function checkAppInstances() {
  const instances = config.app_instances || [];
  const defaultToken = config.default_app_instance_token || process.env.MTA_APP_INSTANCE_TOKEN;
  if (!instances.length && !defaultToken) {
    console.warn('[WARN] No MTA App Instance Tokens configured in mta_config.json or .env. ExecuteTest will require manual token input.');
    return;
  }
  const defaultName = config.default_app_instance || (instances[0] ? instances[0].name : 'default');
  console.log(`[INFO] Configured ${instances.length || 1} MTA App Instance Token(s). Active default: [${defaultName}].`);

  if (config.mendix_mpr_path && fs.existsSync(config.mendix_mpr_path) && defaultToken) {
    const toolsRootDir = path.join(__dirname, '..');
    const mxcliBin = path.join(toolsRootDir, 'bin', process.platform === 'win32' ? 'mxcli.exe' : 'mxcli');
    if (fs.existsSync(mxcliBin)) {
      try {
        const out = require('child_process').execSync(`"${mxcliBin}" describe settings Settings -p "${config.mendix_mpr_path}"`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 10000
        });
        if (out.includes(defaultToken)) {
          console.log('[INFO] Active App Instance Token matches a configuration in the Mendix project model.');
        } else {
          console.log('[NOTICE] Active App Instance Token was not found in the Mendix project settings (it may be an external or custom instance).');
        }
      } catch (e) {}
    }
  }
}

function verifyMode(mode) {
  return new Promise((resolve) => {
    console.log(`Verifying ${mode} MCP server...`);
    checkTokenPreflight(mode);
    const proc = spawn('node', [proxyPath, mode], { stdio: ['pipe', 'pipe', 'inherit'] });
    
    let responseData = '';
    let timeout = setTimeout(() => {
      console.error(`Timeout waiting for ${mode} MCP server.`);
      proc.kill();
      resolve(false);
    }, 5000);
    
    proc.stdout.on('data', (data) => {
      responseData += data.toString();
      if (responseData.includes('jsonrpc')) {
        try {
          const lines = responseData.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            const res = JSON.parse(line);
            if (res.id === 1 && res.result && res.result.tools) {
              clearTimeout(timeout);
              console.log(`[PASS] ${mode} MCP Server is responding correctly (${res.result.tools.length} tools found).`);
              proc.kill();
              return resolve(true);
            } else if (res.error) {
              clearTimeout(timeout);
              console.error(`[FAIL] ${mode} MCP Server returned an error:`, res.error.message);
              proc.kill();
              return resolve(false);
            }
          }
        } catch (e) {
          // Keep buffering
        }
      }
    });
    
    proc.on('close', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });
    
    proc.stdin.write(request + '\n');
  });
}

async function run() {
  console.log(`--- Menditect Workspace Verification${scriptVersion} ---\n`);
  const wsType = config.workspace_type || 'clone_root';
  const wsDir = config.workspace_dir || path.join(__dirname, '..');
  const skillsDir = config.skills_dir || path.join(__dirname, '..', 'skills');
  console.log(`Workspace Type:     ${wsType}`);
  console.log(`Workspace Dir:      ${wsDir}`);
  console.log(`Skills Destination: ${skillsDir}\n`);

  console.log('Checking configuration schema compliance...');
  const schemaResult = validateConfigAgainstSchema(rawConfig);
  if (schemaResult.valid) {
    console.log('[PASS] mta_config.json complies with mta_config.schema.json.');
  } else {
    console.warn('[WARN] mta_config.json has schema validation warnings:');
    schemaResult.errors.forEach(err => console.warn(`  - ${err}`));
  }
  checkSchemaContractAlignment();
  console.log();

  console.log('Checking model tooling readiness...');
  checkMxcliBinary();
  console.log();

  checkSecurityHygiene();
  console.log();

  checkPublicBoundaryHygiene();
  console.log();

  checkAppInstances();
  console.log();

  const mtaOk = await verifyMode('mta');
  console.log();
  const pluginOk = await verifyMode('plugin');
  console.log();

  let spOk = true;
  if (config.model_source === 'studiopro') {
    spOk = await verifyMode('studiopro');
    console.log();
  }
  
  if (mtaOk && pluginOk && spOk) {
    console.log('Verification Complete. All MCP servers and configuration checks passed.');
  } else {
    console.log('Verification Failed. Please check your config and ensure the Mendix app is running if testing the plugin.');
  }
}

run();
