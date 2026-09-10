const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const proxyPath = path.join(__dirname, 'mta-proxy.js');
const configPath = path.join(__dirname, '..', 'mta_config.json');

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
    return true;
  } catch (e) {
    console.warn(`[WARN] mxcli binary present at ${binPath} but failed execution check: ${e.message}`);
    return false;
  }
}

function checkTokenPreflight(mode) {
  if (mode === 'mta') {
    const hasToken = (config.mta_auth_header && config.mta_auth_header.trim()) || process.env.MTA_MCP_AUTH_HEADER || process.env.MTA_MCP_TOKEN;
    if (!hasToken) {
      console.warn('[WARN] No MTA Bearer token configured in mta_config.json or .env. MTA MCP requires authentication.');
    } else {
      console.log('[INFO] MTA Bearer token is configured.');
    }
  } else if (mode === 'plugin') {
    const hasToken = (config.plugin_mcp_token && config.plugin_mcp_token.trim()) || process.env.PLUGIN_MCP_TOKEN;
    if (!hasToken) {
      console.warn('[WARN] No Plugin token configured in mta_config.json or .env (recommended: Bearer <token>).');
    } else {
      console.log('[INFO] Plugin token is configured.');
    }
  } else if (mode === 'studiopro') {
    console.log('[INFO] Studio Pro MCP does not require authentication.');
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
  console.log('--- Menditect Workspace Verification ---\n');
  const wsType = config.workspace_type || 'clone_root';
  const wsDir = config.workspace_dir || path.join(__dirname, '..');
  const skillsDir = config.skills_dir || path.join(__dirname, '..', 'skills');
  console.log(`Workspace Type:     ${wsType}`);
  console.log(`Workspace Dir:      ${wsDir}`);
  console.log(`Skills Destination: ${skillsDir}\n`);

  console.log('Checking configuration schema compliance...');
  const schemaResult = validateConfigAgainstSchema(rawConfig);
  if (schemaResult.valid) {
    console.log('[PASS] mta_config.json complies with mta_config.schema.json.\n');
  } else {
    console.warn('[WARN] mta_config.json has schema validation warnings:');
    schemaResult.errors.forEach(err => console.warn(`  - ${err}`));
    console.log();
  }

  console.log('Checking model tooling readiness...');
  checkMxcliBinary();
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
