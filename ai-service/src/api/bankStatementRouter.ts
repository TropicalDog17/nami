import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {
  processBankStatementFile,
  getBankConfig,
  BatchProcessResult
} from './batchProcessor.js'
import { parseExcelBankStatement, BankStatementConfig } from '../core/excelParser.js'
import { createCorrelationLogger } from '../utils/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../../uploads')

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`
    const ext = path.extname(file.originalname)
    cb(null, `statement-${uniqueSuffix}${ext}`)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedTypes.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`))
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
})

export const bankStatementRouter = Router()

/**
 * POST /api/bank-statement/upload
 * Upload a bank statement Excel file
 *
 * Form data:
 * - file: Excel file (.xlsx, .xls)
 *
 * Returns: { fileId, fileName, originalName, size }
 */
bankStatementRouter.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  const correlationId = `upload-${Date.now()}`
  const logger = createCorrelationLogger(correlationId)

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    logger.info({
      fileName: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    }, 'File uploaded successfully')

    res.json({
      fileId: req.file.filename,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      message: 'File uploaded successfully. Use POST /api/bank-statement/process to process it.'
    })
  } catch (error: any) {
    logger.error({ error: error.message }, 'File upload failed')
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/bank-statement/process
 * Process an uploaded bank statement file
 *
 * Body:
 * - fileId: string (from upload response)
 * - bank?: string (default: techcombank)
 * - skipAI?: boolean (default: false)
 * - dryRun?: boolean (default: false)
 * - spendingAccount?: string
 * - incomeAccount?: string
 *
 * Returns: BatchProcessResult
 */
bankStatementRouter.post('/process', async (req: Request, res: Response) => {
  const correlationId = `process-${Date.now()}`
  const logger = createCorrelationLogger(correlationId)

  try {
    const {
      fileId,
      bank = 'techcombank',
      skipAI = false,
      dryRun = false,
      spendingAccount,
      incomeAccount
    } = req.body

    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' })
    }

    const filePath = path.join(uploadDir, fileId)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found. Please upload again.' })
    }

    logger.info({
      fileId,
      bank,
      skipAI,
      dryRun
    }, 'Starting bank statement processing')

    // Get bank configuration
    let bankConfig: BankStatementConfig
    try {
      bankConfig = getBankConfig(bank)
    } catch (error: any) {
      return res.status(400).json({ error: error.message })
    }

    // Process the file
    const result = await processBankStatementFile(
      filePath,
      bankConfig,
      {
        skipAI,
        dryRun,
        defaultSpendingAccount: spendingAccount,
        defaultIncomeAccount: incomeAccount
      },
      correlationId
    )

    // Clean up uploaded file after processing (optional - keep for debugging)
    // fs.unlinkSync(filePath)

    logger.info({
      batchId: result.batchId,
      processed: result.processedCount,
      failed: result.failedCount
    }, 'Bank statement processing completed')

    res.json(result)
  } catch (error: any) {
    logger.error({ error: error.message }, 'Bank statement processing failed')
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/bank-statement/upload-and-process
 * Upload and process a bank statement in one request
 *
 * Form data:
 * - file: Excel file
 * - bank: string (default: techcombank)
 * - skipAI: boolean (default: false)
 * - dryRun: boolean (default: false)
 * - spendingAccount: string
 * - incomeAccount: string
 *
 * Returns: BatchProcessResult
 */
bankStatementRouter.post('/upload-and-process', upload.single('file'), async (req: Request, res: Response) => {
  const correlationId = `upload-process-${Date.now()}`
  const logger = createCorrelationLogger(correlationId)

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const {
      bank = 'techcombank',
      skipAI = 'false',
      dryRun = 'false',
      spendingAccount,
      incomeAccount
    } = req.body

    logger.info({
      fileName: req.file.filename,
      bank,
      skipAI: skipAI === 'true',
      dryRun: dryRun === 'true'
    }, 'Processing uploaded bank statement')

    // Get bank configuration
    let bankConfig: BankStatementConfig
    try {
      bankConfig = getBankConfig(bank)
    } catch (error: any) {
      return res.status(400).json({ error: error.message })
    }

    // Process the file
    const result = await processBankStatementFile(
      req.file.path,
      bankConfig,
      {
        skipAI: skipAI === 'true',
        dryRun: dryRun === 'true',
        defaultSpendingAccount: spendingAccount,
        defaultIncomeAccount: incomeAccount
      },
      correlationId
    )

    logger.info({
      batchId: result.batchId,
      processed: result.processedCount,
      failed: result.failedCount
    }, 'Bank statement upload and processing completed')

    res.json({
      ...result,
      fileId: req.file.filename,
      originalName: req.file.originalname
    })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Bank statement upload and processing failed')
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/bank-statement/preview
 * Preview transactions from an uploaded file without creating pending actions
 *
 * Body:
 * - fileId: string
 * - bank: string (default: techcombank)
 *
 * Returns: { transactions, summary }
 */
bankStatementRouter.post('/preview', async (req: Request, res: Response) => {
  const correlationId = `preview-${Date.now()}`
  const logger = createCorrelationLogger(correlationId)

  try {
    const { fileId, bank = 'techcombank' } = req.body

    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' })
    }

    const filePath = path.join(uploadDir, fileId)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found. Please upload again.' })
    }

    // Get bank configuration
    let bankConfig: BankStatementConfig
    try {
      bankConfig = getBankConfig(bank)
    } catch (error: any) {
      return res.status(400).json({ error: error.message })
    }

    // Parse without processing
    const transactions = parseExcelBankStatement(filePath, bankConfig, correlationId)

    // Generate summary
    const expenses = transactions.filter(t => t.debit && parseFloat(t.debit.replace(/,/g, '')) > 0)
    const income = transactions.filter(t => t.credit && parseFloat(t.credit.replace(/,/g, '')) > 0)

    const summary = {
      total: transactions.length,
      expenses: expenses.length,
      income: income.length,
      statementType: bankConfig.statementType
    }

    logger.info({
      fileId,
      transactionCount: transactions.length
    }, 'Preview generated')

    res.json({
      transactions: transactions.slice(0, 20), // First 20 for preview
      hasMore: transactions.length > 20,
      summary
    })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Preview generation failed')
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/bank-statement/banks
 * Get available bank configurations
 */
bankStatementRouter.get('/banks', (req: Request, res: Response) => {
  res.json({
    banks: [
      {
        id: 'techcombank',
        name: 'Techcombank (Debit)',
        statementType: 'DEBIT_ACCOUNT',
        description: 'Techcombank checking/savings account statement'
      },
      {
        id: 'techcombank_debit',
        name: 'Techcombank Debit',
        statementType: 'DEBIT_ACCOUNT',
        description: 'Same as techcombank'
      },
      {
        id: 'techcombank_credit',
        name: 'Techcombank Credit Card',
        statementType: 'CREDIT_CARD',
        description: 'Techcombank credit card statement'
      }
    ]
  })
})
