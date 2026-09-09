const https = require('https');
const http = require('http');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const mode = (process.argv[2] || 'mta').toLowerCase();

// Read configuration
let config = {};
try {
  const possiblePaths = [
    process.env.MTA_CONFIG_PATH,
    path.join(__dirname, '..', 'mta_config.json'),
    path.join(process.cwd(), 'mta_config.json')
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      config = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    }
  }
} catch (e) {
  // Ignore missing or malformed config
}

let TARGET_URL = '';
let AUTH_HEADER = null;

if (mode === 'mta') {
  TARGET_URL = config.mcp_endpoint || process.env.MTA_MCP_ENDPOINT || 'https://mta-trial.mendixcloud.com/primitivetools/mcp';
  AUTH_HEADER = config.mta_auth_header || process.env.MTA_MCP_AUTH_HEADER || (process.env.MTA_MCP_TOKEN ? `Bearer ${process.env.MTA_MCP_TOKEN}` : null);
  if (!AUTH_HEADER) {
    console.error('Warning: No MTA Bearer token configured in mta_config.json or MTA_MCP_AUTH_HEADER. Requests to MTA MCP will fail authentication.');
  }
} else if (mode === 'plugin') {
  TARGET_URL = config.plugin_mcp_url || process.env.PLUGIN_MCP_URL || 'http://localhost:8081/plugin/mcp';
  AUTH_HEADER = config.plugin_mcp_token || process.env.PLUGIN_MCP_TOKEN || null;
} else if (mode === 'studiopro') {
  TARGET_URL = config.studiopro_mcp_url || process.env.STUDIOPRO_MCP_URL || 'http://localhost:7782/mcp';
  AUTH_HEADER = null;
}

let sessionId = null;
let reinitPromise = null;
let cachedTools = null;
let cachedInitParams = {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: `mta-proxy-${mode}`, version: '1.2.0' }
};

const CORE_TOOLS = new Set([
  'AddTestCaseVariationItem', 'AddTestSuiteVariationItem', 'CreateAssertAttributeValueCompare',
  'CreateAssertException', 'CreateAssertMicroflowReturnValue', 'CreateAssertObjectCount',
  'CreateAssertValidationFeedbackMessageCompare', 'CreateAssertValidationFeedbackMessageCount',
  'CreateExecutionUser', 'CreateMicroflowCallTestStep', 'CreateObjectActionTestStep',
  'CreateSelectObjectForAssociation', 'CreateTestCase', 'CreateTestCaseVariation',
  'CreateTestSuite', 'CreateTestSuiteVariation', 'EditAssertAttributeValueCompare',
  'EditAssertException', 'EditAssertMicroflowReturnValueCompare', 'EditAssertObjectCount',
  'EditAssertValidationFeedbackMessageCompare', 'EditAssertValidationFeedbackMessageCount',
  'EditAttributeValue', 'EditAttributeValueFilter', 'EditExecutionUser',
  'EditMicroflowObjectParameter', 'EditMicroflowParameterValue', 'EditTestCase',
  'EditTestCaseVariation', 'EditTestStep', 'EditTestStepAssociation', 'EditTestStepRetrieve',
  'EditTestSuite', 'EditTestSuiteVariation', 'ExecuteTest', 'GenerateMicroflowCallTestStepLocatePage',
  'GenerateMicroflowCallTestStepLocateWidget', 'GetApplicationDetails', 'GetAppModelData',
  'GetExecutionPlan', 'GetExecutionUsers', 'GetTestCaseDetails', 'GetTestConfigurationDetails',
  'GetTestRunResults', 'GetTeststepDetails', 'GetTestSuiteDetails', 'MoveTestStepToOtherTestCase',
  'SaveExecutionPlan', 'SetSequenceOfTestCase', 'SetSequenceOfTestStep', 'SetSequenceOfTestSuite',
  'SetTestStepOutputForSelectObjectForChange', 'SetTestStepOutputForSelectObjectForDelete',
  'GetApplicationByName', 'GetApplicationForApplicationInstanceToken', 'GetTestConfigurationsForApplicationKey',
  'ExecuteTestConfiguration', 'GetTestSuites', 'ExecuteTestSuite', 'GetTestCases', 'ExecuteTestCase',
  'GetTestSteps', 'CreateTestStepCreateObject', 'CreateTestStepChangeObject', 'CreateTestStepRetrieveObject',
  'CreateTestStepDeleteObject', 'CreateTestStepPersist', 'GetPages', 'GetWidgets', 'RetrieveTestRunResults'
]);

const FALLBACK_PLUGIN_SCHEMA = {
  jsonrpc: '2.0',
  result: {
    tools: [
      {
        name: 'execute-testcase',
        description: 'Execute a test case locally in the Mendix application under test.',
        inputSchema: {
          type: 'object',
          properties: {
            testCaseId: { type: 'string', description: 'The unique identifier of the test case.' }
          },
          required: ['testCaseId']
        }
      }
    ]
  }
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendHttp(payloadString, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(payloadString, 'utf-8');
    const urlObj = new URL(TARGET_URL);
    const transport = urlObj.protocol === 'https:' ? https : http;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': payload.length,
      ...customHeaders
    };

    if (AUTH_HEADER) {
      headers['Authorization'] = AUTH_HEADER.startsWith('Bearer ') || AUTH_HEADER.startsWith('Basic ')
        ? AUTH_HEADER
        : `Bearer ${AUTH_HEADER}`;
    }

    if (sessionId && !headers['mcp-session-id']) {
      headers['mcp-session-id'] = sessionId;
    }

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: headers,
      timeout: 8000
    };

    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.headers['mcp-session-id']) {
          sessionId = res.headers['mcp-session-id'];
        }
        resolve({ statusCode: res.statusCode, statusMessage: res.statusMessage, headers: res.headers, body });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection timeout'));
    });

    req.write(payload);
    req.end();
  });
}

async function ensureUpstreamInitialized() {
  if (reinitPromise) {
    return reinitPromise;
  }

  reinitPromise = (async () => {
    sessionId = null;
    const initPayload = JSON.stringify({
      jsonrpc: '2.0',
      id: '__proxy_init__' + Date.now(),
      method: 'initialize',
      params: cachedInitParams
    });

    try {
      const res = await sendHttp(initPayload);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (res.headers['mcp-session-id']) {
          sessionId = res.headers['mcp-session-id'];
        }
        // Send notifications/initialized
        const notifyPayload = JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {}
        });
        await sendHttp(notifyPayload).catch(() => {});
        return true;
      }
    } catch (e) {
      // Re-init failed (e.g. server still down)
    } finally {
      reinitPromise = null;
    }
    return false;
  })();

  return reinitPromise;
}

function isSessionError(statusCode, body) {
  if (statusCode === 400 || statusCode === 404) return true;
  const lower = (body || '').toLowerCase();
  return lower.includes('session') || lower.includes('uninitialized') || lower.includes('not found');
}

async function makeRequest(payloadString, requestId, retryCount = 0) {
  let parsedReq = null;
  try {
    parsedReq = JSON.parse(payloadString);
  } catch (e) {
    return;
  }

  // Update cached initialize parameters if received from client
  if (parsedReq && parsedReq.method === 'initialize' && parsedReq.params) {
    cachedInitParams = parsedReq.params;
  }

  try {
    const res = await sendHttp(payloadString);

    // Detect stale or broken session and auto-heal
    if (res.statusCode >= 400 && isSessionError(res.statusCode, res.body) && (mode === 'plugin' || mode === 'studiopro') && retryCount < 2) {
      sessionId = null;
      const reinitialized = await ensureUpstreamInitialized();
      if (reinitialized) {
        return makeRequest(payloadString, requestId, retryCount + 1);
      }
    }

    // Handle authentication or generic HTTP error
    if (res.statusCode >= 400) {
      sessionId = null;
      if (requestId !== null) {
        let errorMsg = `HTTP ${res.statusCode} ${res.statusMessage || ''}: ${res.body.trim() || 'Internal Server Error'}`;
        if (res.statusCode === 401 || res.statusCode === 403) {
          errorMsg = `HTTP ${res.statusCode} ${res.statusMessage || ''}: Authentication failed. Please verify your ${mode.toUpperCase()} Bearer token in mta_config.json or .env. ${res.body.trim()}`;
        }
        const errResponse = JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: errorMsg.trim() },
          id: requestId
        });
        process.stdout.write(errResponse + '\n');
      }
      return;
    }

    if (!res.body.trim() && requestId !== null) {
      const errResponse = JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Empty response received from MCP endpoint' },
        id: requestId
      });
      process.stdout.write(errResponse + '\n');
      return;
    }

    const isToolsList = parsedReq.method === 'tools/list';
    const lines = res.body.split('\n');
    for (let l of lines) {
      l = l.trim();
      if (l.startsWith('data:')) {
        l = l.substring(5).trim();
      } else if (l.startsWith('id:') || l.startsWith('event:') || l.startsWith(':') || !l) {
        continue;
      }
      if (l) {
        if (isToolsList) {
          try {
            const respObj = JSON.parse(l);
            if (respObj.result && Array.isArray(respObj.result.tools)) {
              if (process.env.FILTER_TOOLS === 'true') {
                respObj.result.tools = respObj.result.tools.filter(t => CORE_TOOLS.has(t.name));
              }
              respObj.result.tools.sort((a, b) => {
                const aPriority = CORE_TOOLS.has(a.name) ? 0 : 1;
                const bPriority = CORE_TOOLS.has(b.name) ? 0 : 1;
                return aPriority - bPriority;
              });
              cachedTools = respObj.result.tools;
              l = JSON.stringify(respObj);
            }
          } catch (e) {}
        }
        process.stdout.write(l + '\n');
      }
    }
  } catch (err) {
    handleConnectionError(payloadString, requestId, err, retryCount);
  }
}

async function handleConnectionError(payloadString, requestId, err, retryCount) {
  if (requestId === null) return;
  sessionId = null;

  let parsedReq = null;
  try {
    parsedReq = JSON.parse(payloadString);
  } catch (e) {
    return;
  }

  const isLocalServer = (mode === 'plugin' || mode === 'studiopro');
  const isToolsList = parsedReq && parsedReq.method === 'tools/list';
  const isToolsCall = parsedReq && parsedReq.method === 'tools/call';

  // If server is offline during tools/list, return fallback or cached schema without crashing
  if (isLocalServer && isToolsList) {
    if (mode === 'plugin') {
      const fallbackResponse = JSON.parse(JSON.stringify(FALLBACK_PLUGIN_SCHEMA));
      fallbackResponse.id = requestId;
      process.stdout.write(JSON.stringify(fallbackResponse) + '\n');
      return;
    } else if (mode === 'studiopro') {
      const fallbackTools = cachedTools || [];
      const fallbackResponse = {
        jsonrpc: '2.0',
        id: requestId,
        result: { tools: fallbackTools }
      };
      process.stdout.write(JSON.stringify(fallbackResponse) + '\n');
      return;
    }
  }

  // If server is restarting during tools/call, retry up to 18 times (~27 seconds window)
  const maxRetries = isLocalServer ? 18 : 3;
  if (isLocalServer && (isToolsCall || parsedReq.method === 'initialize') && retryCount < maxRetries) {
    setTimeout(async () => {
      // Prior to replaying tools/call after connection restored, reinitialize upstream
      if (isToolsCall && !sessionId) {
        await ensureUpstreamInitialized();
      }
      makeRequest(payloadString, requestId, retryCount + 1);
    }, 1500);
    return;
  }

  let serverName = mode === 'studiopro' ? 'Mendix Studio Pro' : (mode === 'plugin' ? 'Mendix application' : 'MTA');
  let errMsg = err.message;
  if (err.code === 'ECONNREFUSED' || err.message.includes('timeout') || err.code === 'ECONNRESET') {
    errMsg = `${serverName} at ${TARGET_URL} is currently offline or restarting. Please ensure ${serverName} is running and try again.`;
  }

  const errResponse = JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32603, message: errMsg },
    id: requestId
  });
  process.stdout.write(errResponse + '\n');
}

rl.on('line', (line) => {
  const trimmedLine = line.trim();
  if (!trimmedLine) return;

  let requestId = null;
  let payloadString = trimmedLine;
  try {
    const parsedReq = JSON.parse(trimmedLine);
    if (parsedReq && parsedReq.id !== undefined) {
      requestId = parsedReq.id;
    }
    if (parsedReq && parsedReq.method === 'tools/call' && parsedReq.params && parsedReq.params.arguments) {
      let argsStr = JSON.stringify(parsedReq.params.arguments);
      argsStr = argsStr.replace(/"AssociationOwner"\s*:\s*"Default"/g, '"AssociationOwner":"_Default"');
      argsStr = argsStr.replace(/"AssociationOwner"\s*:\s*"Both"/g, '"AssociationOwner":"_Both"');
      parsedReq.params.arguments = JSON.parse(argsStr);
      payloadString = JSON.stringify(parsedReq);
    }
  } catch (e) {
    return;
  }

  makeRequest(payloadString, requestId);
});
