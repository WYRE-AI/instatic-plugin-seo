/**
 * Typecheck this plugin's own sources.
 *
 * `tsconfig.json` maps `@instatic/*` and `@core/*` into the vendored
 * Instatic checkout under `.instatic/`, which is what gives the admin
 * bundle real host prop types instead of hand-written guesses. The
 * side effect is that TypeScript pulls that host source into the same
 * program — and the host compiles under looser options than this repo
 * uses (no `strict`, no `noUncheckedIndexedAccess`), so it reports
 * hundreds of errors that belong to the dependency, not to us.
 *
 * Weakening this repo's compiler options to silence a dependency would
 * be the wrong trade. Instead, run `tsc` and fail only on diagnostics
 * from files we actually own.
 */
import { spawnSync } from 'node:child_process'

const VENDORED_PREFIX = '.instatic/'

const result = spawnSync('tsc', ['--noEmit', '--pretty', 'false'], {
  encoding: 'utf-8',
  shell: true,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

// tsc emits `path(line,col): error TSxxxx: message`, with wrapped detail
// lines indented beneath. Keep only diagnostics whose file is ours.
const ours = output
  .split('\n')
  .filter((line) => /^\S.*error TS\d+:/.test(line))
  .filter((line) => !line.startsWith(VENDORED_PREFIX))

if (ours.length > 0) {
  console.error(ours.join('\n'))
  console.error(`\n${ours.length} type error${ours.length === 1 ? '' : 's'} in plugin sources.`)
  process.exit(1)
}

console.log('✓ No type errors in plugin sources.')
