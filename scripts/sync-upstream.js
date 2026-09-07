const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const rootDir = path.join(__dirname, '..');
const binDir = path.join(rootDir, 'bin');
const skillsDir = path.join(rootDir, 'skills');

if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

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

async function syncSkills() {
  console.log('Syncing skills from Menditect/agentic-test-skills...');
  const tmpDir = path.join(os.tmpdir(), 'agentic-test-skills-tmp-' + Date.now());
  try {
    execSync(`git clone --depth 1 https://github.com/Menditect/agentic-test-skills.git "${tmpDir}"`, { stdio: 'ignore' });
    
    // Copy AgenticTestSkills contents to ./skills/
    const sourceSkillsDir = path.join(tmpDir, 'AgenticTestSkills');
    if (fs.existsSync(sourceSkillsDir)) {
      if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
      
      // Use OS specific copy
      if (process.platform === 'win32') {
        execSync(`xcopy /E /I /Y "${sourceSkillsDir}\\*" "${skillsDir}\\"`, { stdio: 'ignore' });
      } else {
        execSync(`cp -R "${sourceSkillsDir}/"* "${skillsDir}/"`, { stdio: 'ignore' });
      }
      console.log('Skills synced successfully into ./skills/');
    } else {
      console.log('AgenticTestSkills directory not found in repo.');
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
    const binaryPath = path.join(binDir, finalBinName);
    
    console.log(`Downloading ${asset.browser_download_url}...`);
    await downloadFile(asset.browser_download_url, binaryPath);
    
    if (platform !== 'win32') {
      if (fs.existsSync(binaryPath)) {
        fs.chmodSync(binaryPath, 0o755);
        console.log('Applied chmod +x to mxcli.');
      }
    }
    console.log('mxcli updated successfully in ./bin/');
  } catch (err) {
    console.error('Failed to update mxcli:', err.message);
  }
}

async function run() {
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
