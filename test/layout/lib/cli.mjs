'use strict';

const DEFAULT_URL = 'http://127.0.0.1:8000/';

// Parses argv (already stripped of `node run.mjs`): an optional --url, and
// any remaining positional arguments naming check files to run.
export function parseArgs(argv) {
  let url = DEFAULT_URL;
  const names = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') {
      i++;
      if (i >= argv.length) throw new Error('--url needs a value');
      url = argv[i];
    } else if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length);
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      names.push(arg);
    }
  }
  return { url, names };
}
