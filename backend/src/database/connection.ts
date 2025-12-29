import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'nami.db');

let db: Database.Database | null = null;

export function getConnection(dbPath?: string): Database.Database {
  if (!db) {
    const actualPath = dbPath || DB_PATH;

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    db = new Database(actualPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
    });

    // Enable WAL mode for better concurrent performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Performance optimizations
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    db.pragma('temp_store = MEMORY');
  }

  return db;
}

export function closeConnection(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function initializeDatabase(schemaPath?: string): void {
  const connection = getConnection();
  const actualSchemaPath = schemaPath || path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(actualSchemaPath, 'utf-8');

  // Check if tables exist
  const tableExists = connection.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='transactions'
  `).get();

  if (!tableExists) {
    connection.exec(schema);
    console.log('Database schema initialized');
  }
}

export function resetConnection(dbPath?: string): void {
  closeConnection();
  db = null;
  getConnection(dbPath);
}

// For testing: create in-memory database
export function createInMemoryDatabase(): Database.Database {
  return getConnection(':memory:');
}
