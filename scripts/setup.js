const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const rootDir = path.join(__dirname, '..');

function ask(question, defaultVal) {
  return new Promise(resolve => {
    rl.question(`${question} [${defaultVal}]: `, answer => {
      resolve(answer.trim() || defaultVal);
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

async function run() {
  console.log('--- Menditect Workspace Setup ---');
  
  const mtaUrl = await ask('MTA URL', 'https://mta-trial.mendixcloud.com');
  const mcpEndpoint = mtaUrl.replace(/\/$/, '') + '/primitivetools/mcp';
  
  const pluginUrl = await ask('App under test Plugin URL', 'http://localhost:8081/plugin/mcp');
  const pluginToken = await ask('Plugin Token (e.g. Bearer 1)', 'Bearer 1');
  
  let modelSource = '';
  while (modelSource !== '1' && modelSource !== '2') {
    modelSource = await ask('Model Source: [1] mxcli, [2] Studio Pro MCP', '1');
  }
  
  let projectDir = '';
  let mprPath = '';
  let mcpSource = 'mxcli';
  
  if (modelSource === '1') {
    mcpSource = 'mxcli';
    projectDir = await ask('Mendix Project Directory', process.cwd());
    const foundMpr = findMpr(projectDir);
    if (foundMpr) {
      console.log(`Found .mpr file: ${foundMpr}`);
      mprPath = foundMpr;
    } else {
      console.log('Warning: No .mpr file found in directory.');
    }
  } else {
    mcpSource = 'studiopro';
  }
  
  // Write mta_config.json
  const config = {
    mta_base_url: mtaUrl,
    mcp_endpoint: mcpEndpoint,
    plugin_mcp_url: pluginUrl,
    plugin_mcp_token: pluginToken,
    model_source: mcpSource,
    mendix_project_dir: projectDir,
    mendix_mpr_path: mprPath
  };
  
  fs.writeFileSync(path.join(rootDir, 'mta_config.json'), JSON.stringify(config, null, 2));
  console.log('Created mta_config.json');
  
  // Write .env
  const envContent = `MTA_MCP_ENDPOINT="${mcpEndpoint}"
MTA_MCP_AUTH_HEADER=""
PLUGIN_MCP_URL="${pluginUrl}"
PLUGIN_MCP_TOKEN="${pluginToken}"
MENDIX_PROJECT_DIR="${projectDir}"
MENDIX_MPR_PATH="${mprPath}"
`;
  fs.writeFileSync(path.join(rootDir, '.env'), envContent);
  console.log('Created .env');
  
  // Create IDE configs
  generateIdeConfigs(mcpSource, projectDir, mprPath, mtaBaseUrl);
  
  console.log('\nSetup complete! You can now run "npm run update" to fetch skills and mxcli.');
  rl.close();
}

function generateIdeConfigs(mcpSource, projectDir, mprPath, mtaBaseUrl) {
  // Read templates
  const mcpServers = {
    "mta": {
      "command": "node",
      "args": ["${workspaceFolder}/scripts/mta-proxy.js", "mta"]
    },
    "mta_plugin": {
      "command": "node",
      "args": ["${workspaceFolder}/scripts/mta-proxy.js", "plugin"]
    }
  };
  
  if (mcpSource === 'studiopro') {
    mcpServers['StudioPro'] = {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sse", "http://localhost:7782/mcp"]
    };
    console.log('Note: Studio Pro MCP defaults to port 7782. Edit generated IDE configs if your port differs.');
  }
  
  const mcpJson = { mcpServers };
  
  // VS Code
  const vscodeDir = path.join(rootDir, '.vscode');
  if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });
  fs.writeFileSync(path.join(vscodeDir, 'mcp.json'), JSON.stringify(mcpJson, null, 2));
  
  // VS Code terminal environment settings (.vscode/settings.json)
  const vscodeSettings = {
    "terminal.integrated.env.windows": {
      "MENDIX_PROJECT_PATH": projectDir || "",
      "MENDIX_MPR_FILE": mprPath || "",
      "MTA_BASE_URL": mtaBaseUrl || ""
    },
    "terminal.integrated.env.linux": {
      "MENDIX_PROJECT_PATH": projectDir || "",
      "MENDIX_MPR_FILE": mprPath || "",
      "MTA_BASE_URL": mtaBaseUrl || ""
    },
    "terminal.integrated.env.osx": {
      "MENDIX_PROJECT_PATH": projectDir || "",
      "MENDIX_MPR_FILE": mprPath || "",
      "MTA_BASE_URL": mtaBaseUrl || ""
    }
  };
  fs.writeFileSync(path.join(vscodeDir, 'settings.json'), JSON.stringify(vscodeSettings, null, 2));

  // Cursor
  const cursorDir = path.join(rootDir, '.cursor');
  if (!fs.existsSync(cursorDir)) fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(path.join(cursorDir, 'mcp.json'), JSON.stringify(mcpJson, null, 2));
  
  // Claude
  const claudeDir = path.join(rootDir, '.claude');
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(mcpJson, null, 2));
  
  console.log('Generated IDE configurations in .vscode/, .cursor/, and .claude/');
}

run();
