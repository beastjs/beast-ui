import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { createInterface, type Interface } from 'node:readline/promises'
import { paint, symbols } from '../../packages/cli/src/utils/ui.ts'

export const say = (text = '') => { process.stdout.write(`${text}\n`) }
export const fail = (text: string) => say(`    ${paint('red', symbols.fail)} ${text}`)
/** Splits a comma- or space-separated answer; `-` means none. */
export const list = (answer: string): string[] => (answer === '-' ? [] : answer.split(/[\s,]+/).filter(Boolean))

/**
 * The terminal prompt. Ctrl+C stops at the current question: anything already
 * written stays, and nothing of the component being asked about is written.
 */
export function createPrompt(): Interface {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  prompt.on('SIGINT', () => {
    say()
    say()
    say(`  ${paint('dim', 'Stopped. Files already written are kept; nothing else was changed.')}`)
    say()
    prompt.close()
    process.exit(130)
  })
  return prompt
}

export const wantsHelp = (args: string[]): boolean => args.includes('--help') || args.includes('-h')

/** Prints a command's help: a heading line, then pre-formatted body lines. */
export function printHelp(lines: string[]): void {
  say()
  for (const line of lines) say(line ? `  ${line}` : '')
  say()
}

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

/** Icon names the showcase sidebar can draw: one per .svg in packages/icons/svg. */
export async function iconNames(root: string): Promise<string[]> {
  const files = await readdir(path.join(root, 'packages/icons/svg'))
  return files.filter((file) => file.endsWith('.svg')).map((file) => file.slice(0, -4)).sort()
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
