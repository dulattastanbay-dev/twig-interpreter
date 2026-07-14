import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, '..', '..', 'index.html');

export function loadTwigCore() {
  const html = readFileSync(indexPath, 'utf8');
  const match = html.match(/<script id="twig-core">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('Could not find <script id="twig-core"> block in index.html');
  }
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'twig-core.js' });
  if (!sandbox.Twig) {
    throw new Error('twig-core script did not define a global Twig object');
  }
  return sandbox.Twig;
}
