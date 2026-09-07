const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const releasesDir = path.join(rootDir, 'releases');
const releasesIndexFile = path.join(rootDir, 'RELEASES.md');
const packageJsonFile = path.join(rootDir, 'package.json');

if (!fs.existsSync(releasesDir)) {
  fs.mkdirSync(releasesDir, { recursive: true });
}

function prompt(question, defaultValue) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    const q = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(q, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

function getLatestGitCommits() {
  try {
    const latestTag = execSync('git describe --tags --abbrev=0', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    return execSync(`git log ${latestTag}..HEAD --oneline`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    try {
      return execSync('git log -n 10 --oneline', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    } catch (err) {
      return '';
    }
  }
}

async function run() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'));
  const currentVersion = pkg.version || '1.0.0';

  const parts = currentVersion.split('.').map(Number);
  const defaultNextVersion = `${parts[0]}.${parts[1]}.${(parts[2] || 0) + 1}`;

  const argVersion = process.argv[2];
  const argSummary = process.argv[3];

  const versionInput = argVersion || await prompt('Release version (without "v")', defaultNextVersion);
  const version = versionInput.startsWith('v') ? versionInput : `v${versionInput}`;
  const rawVersion = version.replace(/^v/, '');

  const summary = argSummary || await prompt('Key highlights / summary of this release', 'Maintenance and feature updates');

  const today = new Date().toISOString().split('T')[0];
  const releaseFile = path.join(releasesDir, `${version}.md`);

  const commits = getLatestGitCommits();
  const commitSection = commits
    ? `\n### Recent Changes\n\n\`\`\`\n${commits}\n\`\`\`\n`
    : '';

  const releaseContent = `# Menditect Agent Workspace Template - Release Notes

## Version ${version}

> Released on: ${today}

### Release Summary
${summary}

---

### Detailed Changes
- Document changes here.
${commitSection}
---

### Upgrading / Migration Notes
No breaking changes. Run \`npm run update:skills\` and \`npm run update:mxcli\` to ensure dependencies are current.
`;

  fs.writeFileSync(releaseFile, releaseContent, 'utf8');
  console.log(`Created ${path.relative(rootDir, releaseFile)}`);

  // Update RELEASES.md table
  if (fs.existsSync(releasesIndexFile)) {
    let indexContent = fs.readFileSync(releasesIndexFile, 'utf8');
    const tableHeader = '| Release Version | Date | Key Highlights / Release Message |\n| :--- | :--- | :--- |\n';
    const newRow = `| [${version}](releases/${version}.md) | ${today} | ${summary} |\n`;

    if (indexContent.includes(tableHeader)) {
      indexContent = indexContent.replace(tableHeader, tableHeader + newRow);
      fs.writeFileSync(releasesIndexFile, indexContent, 'utf8');
      console.log(`Updated ${path.relative(rootDir, releasesIndexFile)}`);
    }
  }

  // Bump package.json version
  pkg.version = rawVersion;
  fs.writeFileSync(packageJsonFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`Updated package.json version to ${rawVersion}`);

  console.log(`\nRelease ${version} prepared successfully.`);
  console.log('Next steps:');
  console.log(`  1. Review and edit releases/${version}.md`);
  console.log(`  2. git commit -am "chore(release): ${version}"`);
  console.log(`  3. git tag ${version}`);
  console.log('  4. git push origin main --tags');
}

run();
