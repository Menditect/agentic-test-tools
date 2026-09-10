const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const proxyPath = path.join(__dirname, 'mta-proxy.js');
const configPath = path.join(__dirname, '..', 'mta_config.json');

let config = {};
try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {}

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
    console.log('Verification Complete. All MCP servers are responding correctly.');
  } else {
    console.log('Verification Failed. Please check your config and ensure the Mendix app is running if testing the plugin.');
  }
}

run();
