import { createInterface } from 'node:readline/promises'
import { styleText } from 'node:util'

type Style = Parameters<typeof styleText>[0]

// Color only on an interactive terminal that has not opted out.
const colorEnabled = (): boolean =>
  Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb'

export const paint = (style: Style, text: string): string =>
  colorEnabled() ? styleText(style, text, { validateStream: false }) : text

export const symbols = {
  brand: '◆',
  ok: '✓',
  fail: '✗',
  create: '+',
  replace: '~',
  keep: '=',
  item: '›',
} as const

export interface Task {
  done(text: string): void
  fail(text: string): void
}

export interface Reporter {
  line(text?: string): void
  task(text: string): Task
  /** Asks a yes/no question; absent when no one is there to answer. */
  confirm?: (question: string, initial: boolean) => Promise<boolean>
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function terminalReporter(): Reporter {
  const out = process.stdout
  const interactive = Boolean(process.stdin.isTTY && out.isTTY)
  return {
    line: (text = '') => { out.write(`${text}\n`) },
    task(text) {
      const started = Date.now()
      const elapsed = () => paint('dim', `${((Date.now() - started) / 1000).toFixed(1)}s`)
      if (!out.isTTY) {
        out.write(`  ${text}\n`)
        return {
          done: (message) => { out.write(`  ${symbols.ok} ${message} ${elapsed()}\n`) },
          fail: (message) => { out.write(`  ${symbols.fail} ${message}\n`) },
        }
      }
      let frame = 0
      const draw = () => { out.write(`\r\x1b[2K  ${paint('cyan', FRAMES[frame++ % FRAMES.length])} ${text}`) }
      draw()
      const timer = setInterval(draw, 80)
      const finish = (line: string) => {
        clearInterval(timer)
        out.write(`\r\x1b[2K${line}\n`)
      }
      return {
        done: (message) => finish(`  ${paint('green', symbols.ok)} ${message} ${elapsed()}`),
        fail: (message) => finish(`  ${paint('red', symbols.fail)} ${message}`),
      }
    },
    confirm: interactive
      ? async (question, initial) => {
          const prompt = createInterface({ input: process.stdin, output: out })
          try {
            const hint = paint('dim', initial ? '(Y/n)' : '(y/N)')
            const answer = (await prompt.question(`  ${paint('cyan', '?')} ${question} ${hint} `)).trim().toLowerCase()
            return answer === '' ? initial : answer === 'y' || answer === 'yes'
          } finally {
            prompt.close()
          }
        }
      : undefined,
  }
}

/** Splits `name@range` into its package name and version range, keeping scopes intact. */
export function splitDependency(dependency: string): { name: string; range: string } {
  const at = dependency.lastIndexOf('@')
  return at > 0 ? { name: dependency.slice(0, at), range: dependency.slice(at + 1) } : { name: dependency, range: 'latest' }
}
