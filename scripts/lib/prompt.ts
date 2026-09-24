import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Interface } from 'node:readline/promises'
import { paint, symbols } from '../../packages/cli/src/utils/ui.ts'

export const say = (text = '') => { process.stdout.write(`${text}\n`) }
export const fail = (text: string) => say(`    ${paint('red', symbols.fail)} ${text}`)
/** Splits a comma- or space-separated answer; `-` means none. */
export const list = (answer: string): string[] => (answer === '-' ? [] : answer.split(/[\s,]+/).filter(Boolean))

export interface AskOptions {
  initial?: string
  required?: boolean
  hint?: string
  validate?: (answer: string) => string | undefined
}

export async function ask(prompt: Interface, label: string, options: AskOptions = {}): Promise<string> {
  for (;;) {
    const shown = options.initial ? paint('dim', ` (${options.initial})`) : ''
    const hint = options.hint ? paint('dim', ` ${options.hint}`) : ''
    const answer = (await prompt.question(`  ${paint('cyan', '?')} ${label}${shown}${hint} `)).trim() || options.initial || ''
    if (!answer && options.required) { fail('Required.'); continue }
    const error = options.validate?.(answer)
    if (error) { fail(error); continue }
    return answer
  }
}

export async function confirm(prompt: Interface, label: string, initial: boolean): Promise<boolean> {
  for (;;) {
    const answer = (await prompt.question(`  ${paint('cyan', '?')} ${label} ${paint('dim', initial ? '(Y/n)' : '(y/N)')} `)).trim().toLowerCase()
    if (answer === '') return initial
    if (/^(y|yes|n|no)$/.test(answer)) return answer.startsWith('y')
    fail('Answer y or n.')
  }
}

/** Icon names the showcase sidebar can draw. */
export async function iconNames(root: string): Promise<string[]> {
  const source = await readFile(path.join(root, 'apps/web/src/lib/icons/icons.ts'), 'utf8')
  return [...source.matchAll(/^ {2}'?([a-z][a-z0-9-]*)'?: ?\{/gm)].map((match) => match[1])
}

/** Runs a command quietly, showing its output only when it fails. */
export async function runStep(root: string, label: string, command: string, args: string[]): Promise<boolean> {
  process.stdout.write(`  ${paint('dim', '…')} ${label}`)
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    const output: string[] = []
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()))
    child.once('close', (code) => {
      process.stdout.write(`\r\x1b[2K`)
      if (code === 0) { say(`  ${paint('green', symbols.ok)} ${label}`); resolve(true); return }
      say(`  ${paint('red', symbols.fail)} ${label}`)
      say(paint('dim', output.join('').trim().split('\n').slice(-15).map((line) => `    ${line}`).join('\n')))
      resolve(false)
    })
  })
}
