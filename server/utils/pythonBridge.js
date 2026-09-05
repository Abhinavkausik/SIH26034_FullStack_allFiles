const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const PYTHON_EXECUTABLE = 'D:\\PRIYADIP\\.venv\\Scripts\\python.exe';
const BRIDGE_SCRIPT = path.join(__dirname, '..', 'scripts', 'run_compliance_bridge.py');

function runPythonCompliance(imagePath, options = {}) {
  return new Promise((resolve, reject) => {
    if (!imagePath) {
      return reject(new Error('Image path is required.'));
    }

    // We only check for existence if we are not skipping it in tests
    if (!options.skipFileCheck && !fs.existsSync(imagePath)) {
      return reject(new Error('Image file does not exist.'));
    }

    const exe = options.exe || PYTHON_EXECUTABLE;
    const script = options.script || BRIDGE_SCRIPT;
    const env = { ...process.env, PYTHONPATH: 'D:\\PRIYADIP', ...options.env };
    const timeout = options.timeout !== undefined ? options.timeout : 60000;

    execFile(exe, [script, imagePath], { env, timeout }, (error, stdout, stderr) => {
      if (error) { console.error('PYTHON STDERR:', stderr);
        if (error.killed) {
          return reject(new Error('Python bridge timeout.'));
        }
        return reject(new Error(`Python process exited with code ${error.code || 'unknown'}.`));
      }

      try {
        const jsonStr = stdout.trim();
        const parsed = JSON.parse(jsonStr);
        
        const requiredKeys = [
          'product_id', 'category', 'overall_decision', 'summary', 'violations', 
          'needs_review', 'passed_fields', 'not_applicable_fields', 'warnings'
        ];
        
        for (const key of requiredKeys) {
          if (!(key in parsed)) {
            return reject(new Error(`Missing required field in Python output: ${key}`));
          }
        }

        const validDecisions = ['COMPLIANT', 'NON_COMPLIANT', 'NEEDS_REVIEW'];
        if (!validDecisions.includes(parsed.overall_decision)) {
          return reject(new Error(`Invalid overall_decision: ${parsed.overall_decision}`));
        }

        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON output from Python bridge.'));
      }
    });
  });
}

module.exports = { runPythonCompliance, PYTHON_EXECUTABLE, BRIDGE_SCRIPT };
