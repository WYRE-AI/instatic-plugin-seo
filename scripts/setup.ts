/**
 * One-time developer setup.
 *
 * The Instatic plugin SDK and its `instatic-plugin` CLI are NOT published
 * to npm — they live inside the CMS repository and are reached through
 * the in-repo `@core/plugin-sdk` alias. Building a plugin therefore
 * requires a local checkout of the CMS.
 *
 * This script vendors that checkout into `.instatic/` (gitignored) and
 * installs its dependencies, which the CLI needs because evaluating a
 * plugin config loads the host's base module registry.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const REPO = 'https://github.com/corebunch/instatic.git'
/** Pinned so a plugin build is reproducible against a known SDK surface. */
const REF = '6b055cf7'
const DIR = '.instatic'

function run(command: string, args: string[], cwd = process.cwd()): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`)
  }
}

if (existsSync(DIR)) {
  console.log(`${DIR}/ already exists — skipping clone.`)
} else {
  console.log(`Cloning Instatic into ${DIR}/ …`)
  run('git', ['clone', '--quiet', REPO, DIR])
  run('git', ['checkout', '--quiet', REF], DIR)
}

console.log('Installing Instatic dependencies (needed by the plugin CLI) …')
run('bun', ['install'], DIR)

console.log('\n✓ Setup complete. Now run:')
console.log('    bun run lint')
console.log('    bun run build')
