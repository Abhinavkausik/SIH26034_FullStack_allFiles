const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { runPythonCompliance } = require('../utils/pythonBridge');

const PYTHON_EXECUTABLE = process.platform === 'win32' ? 'python' : 'python3';
const MOCK_SCRIPT = path.join(__dirname, 'mock_env_python.py');

process.env.GEMINI_API_KEY = 'test-sentinel';

test('environment propagation: GEMINI_API_KEY reaches child process', async () => {
  const options = {
    exe: PYTHON_EXECUTABLE,
    script: MOCK_SCRIPT,
    skipFileCheck: true
  };
  const result = await runPythonCompliance('dummy.jpg', options);
  assert.strictEqual(result.env_key, 'test-sentinel');
});
