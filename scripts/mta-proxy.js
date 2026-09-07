const https = require('https');
const http = require('http');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'mta';

// Read config
let config = {};
try {
  const configPath = path.join(__dirname, '..', 'mta_config.json');
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  // ignore
}

let TARGET_URL = '';
let AUTH_HEADER = null;

if (mode === 'mta') {
  TARGET_URL = config.mcp_endpoint || process.env.MTA_MCP_ENDPOINT || 'https://mta-trial.mendixcloud.com/primitivetools/mcp';
  AUTH_HEADER = process.env.MTA_MCP_AUTH_HEADER || (process.env.MTA_MCP_TOKEN ? `Bearer ${process.env.MTA_MCP_TOKEN}` : null);
} else if (mode === 'plugin') {
  TARGET_URL = config.plugin_mcp_url || 'http://localhost:8081/plugin/mcp';
  AUTH_HEADER = config.plugin_mcp_token || null;
}

let sessionId = null;

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

function makeRequest(payloadString, requestId, retryCount = 0) {
  const payload = Buffer.from(payloadString, 'utf-8');
  const urlObj = new URL(TARGET_URL);
  const transport = urlObj.protocol === 'https:' ? https : http;

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Content-Length': payload.length
  };

  if (AUTH_HEADER) {
    headers['Authorization'] = AUTH_HEADER.startsWith('Bearer ') || AUTH_HEADER.startsWith('Basic ') ? AUTH_HEADER : `Bearer ${AUTH_HEADER}`;
  }
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: headers,
    timeout: 5000
  };

  const req = transport.request(options, (res) => {
    if (res.headers['mcp-session-id']) {
      sessionId = res.headers['mcp-session-id'];
    }
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      if (res.statusCode >= 400) {
        if (requestId !== null) {
          const errResponse = JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: `HTTP ${res.statusCode} ${res.statusMessage || ''}: ${body.trim() || 'Internal Server Error / Authentication Failed'}` },
            id: requestId
          });
          process.stdout.write(errResponse + '\n');
        }
        return;
      }
      if (!body.trim() && requestId !== null) {
        const errResponse = JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Empty response received from MCP endpoint' },
          id: requestId
        });
        process.stdout.write(errResponse + '\n');
        return;
      }

      const isToolsList = JSON.parse(payloadString).method === 'tools/list';
      const lines = body.split('\n');
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
                l = JSON.stringify(respObj);
              }
            } catch (e) {}
          }
          process.stdout.write(l + '\n');
        }
      }
    });
  });

  req.on('error', (err) => {
    handleConnectionError(payloadString, requestId, err, retryCount);
  });
  
  req.on('timeout', () => {
    req.destroy();
    handleConnectionError(payloadString, requestId, new Error('Connection timeout'), retryCount);
  });

  req.write(payload);
  req.end();
}

function handleConnectionError(payloadString, requestId, err, retryCount) {
  if (requestId === null) return;
  
  const parsedReq = JSON.parse(payloadString);
  
  if (mode === 'plugin' && parsedReq.method === 'tools/list') {
    const fallbackResponse = JSON.parse(JSON.stringify(FALLBACK_PLUGIN_SCHEMA));
    fallbackResponse.id = requestId;
    process.stdout.write(JSON.stringify(fallbackResponse) + '\n');
    return;
  }
  
  if (mode === 'plugin' && parsedReq.method === 'tools/call' && retryCount < 3) {
    setTimeout(() => {
      makeRequest(payloadString, requestId, retryCount + 1);
    }, 1500);
    return;
  }
  
  let errMsg = err.message;
  if (mode === 'plugin' && (err.code === 'ECONNREFUSED' || err.message.includes('timeout'))) {
    errMsg = `Mendix application at ${TARGET_URL} is currently offline or restarting. Please ensure the Mendix app is running and try again.`;
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
