#!/usr/bin/env node
/**
 * CLI tool to process bank statement Excel files
 *
 * Usage:
 *   npx tsx src/cli/processBankStatement.ts <file-path> [options]
 *
 * Options:
 *   --bank=<name>       Bank name (default: techcombank)
 *   --skip-ai           Skip AI classification (faster, less accurate)
 *   --dry-run           Don't create pending actions, just preview
 *   --spending=<name>   Default spending account name
 *   --income=<name>     Default income account name
 *   --batch-size=<n>    Number of parallel AI requests (default: 5)
 *
 * Examples:
 *   npx tsx src/cli/processBankStatement.ts data/SaoKeTK.xlsx
 *   npx tsx src/cli/processBankStatement.ts data/SaoKeTK.xlsx --skip-ai --dry-run
 *   npx tsx src/cli/processBankStatement.ts data/SaoKeTK.xlsx --bank=techcombank_credit
 */

import path from 'path'
import { fileURLToPath } from 'url'
import {
  processBankStatementFile,
  getBankConfig,
  formatBatchResult
} from '../api/batchProcessor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface CliOptions {
  filePath: string
  bank: string
  skipAI: boolean
  dryRun: boolean
  spendingAccount?: string
  incomeAccount?: string
  batchSize: number
}

function parseArgs(args: string[]): CliOptions {
  const filePath = args.find(a => !a.startsWith('--')) ||
    path.join(__dirname, '../../data/SaoKeTK_29112025_28122025.xlsx')

  let bank = 'techcombank'
  let skipAI = false
  let dryRun = false
  let spendingAccount: string | undefined
  let incomeAccount: string | undefined
  let batchSize = 5

  for (const arg of args) {
    if (arg.startsWith('--bank=')) {
      bank = arg.split('=')[1]
    } else if (arg === '--skip-ai') {
      skipAI = true
    } else if (arg === '--dry-run') {
      dryRun = true
    } else if (arg.startsWith('--spending=')) {
      spendingAccount = arg.split('=')[1]
    } else if (arg.startsWith('--income=')) {
      incomeAccount = arg.split('=')[1]
    } else if (arg.startsWith('--batch-size=')) {
      batchSize = parseInt(arg.split('=')[1], 10) || 5
    }
  }

  return {
    filePath: path.resolve(filePath),
    bank,
    skipAI,
    dryRun,
    spendingAccount,
    incomeAccount,
    batchSize
  }
}

function printUsage(): void {
  console.log(`
Bank Statement Processor CLI

Usage:
  npx tsx src/cli/processBankStatement.ts <file-path> [options]

Options:
  --bank=<name>       Bank name (default: techcombank)
                      Available: techcombank, techcombank_debit, techcombank_credit
  --skip-ai           Skip AI classification (faster, less accurate)
  --dry-run           Don't create pending actions, just preview
  --spending=<name>   Default spending account name
  --income=<name>     Default income account name
  --batch-size=<n>    Number of parallel AI requests (default: 5)

Examples:
  npx tsx src/cli/processBankStatement.ts data/SaoKeTK.xlsx
  npx tsx src/cli/processBankStatement.ts data/SaoKeTK.xlsx --skip-ai --dry-run
  npx tsx src/cli/processBankStatement.ts data/SaoKeTK.xlsx --bank=techcombank_credit
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    process.exit(0)
  }

  const options = parseArgs(args)

  console.log('\n🏦 Bank Statement Processor')
  console.log('═'.repeat(50))
  console.log(`File: ${options.filePath}`)
  console.log(`Bank: ${options.bank}`)
  console.log(`Skip AI: ${options.skipAI}`)
  console.log(`Dry Run: ${options.dryRun}`)
  console.log(`Batch Size: ${options.batchSize}`)
  console.log('═'.repeat(50))
  console.log('')

  try {
    // Get bank configuration
    const bankConfig = getBankConfig(options.bank)
    console.log(`📋 Statement Type: ${bankConfig.statementType}`)
    console.log('')

    // Process the file
    console.log('⏳ Processing...\n')

    const result = await processBankStatementFile(
      options.filePath,
      bankConfig,
      {
        skipAI: options.skipAI,
        dryRun: options.dryRun,
        batchSize: options.batchSize,
        defaultSpendingAccount: options.spendingAccount,
        defaultIncomeAccount: options.incomeAccount
      },
      'cli-process'
    )

    // Print result
    console.log('\n' + formatBatchResult(result))

    if (result.failedCount > 0) {
      process.exit(1)
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
