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
  const mtaOk = await verifyMode('mta');
  console.log();
  const pluginOk = await verifyMode('plugin');
  console.log();
  
  if (mtaOk && pluginOk) {
    console.log('Verification Complete. All MCP servers are responding correctly.');
  } else {
    console.log('Verification Failed. Please check your config and ensure the Mendix app is running if testing the plugin.');
  }
}

run();
