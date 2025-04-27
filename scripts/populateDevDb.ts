/**
 * Matter Certification Database Population Tool
 * 
 * This script reads JSON data files from the data-for-dev directory
 * and populates a SQLite development database with the data.
 * 
 * Usage:
 *   npm run populate-dev-db -- [options]
 * 
 * Options:
 *   --db-path     Path to SQLite database file (default: ./dev-db.sqlite)
 *   --data-dir    Path to directory containing JSON data files (default: ./data-for-dev)
 *   --reset       Reset the database before importing (removes existing data)
 *   --verbose     Show detailed logs
 */

import fs from 'fs';
import path from 'path';
import { Database } from 'better-sqlite3';
import better_sqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';

// Define interfaces based on the data structure
interface DeviceBasic {
  url: string;
  manufacturer: string;
  model: string;
  certificateId: string;
  pageId: number;
  indexInPage: number;
  
  // DeviceBasic에는 없지만 타입 체크를 위해 선택적 필드로 추가
  id?: string;
  deviceType?: string;
  certificationId?: string;
  certificationDate?: string;
  softwareVersion?: string;
  hardwareVersion?: string;
  vid?: string;
  pid?: string;
  familySku?: string;
  familyVariantSku?: string;
  firmwareVersion?: string;
  familyId?: string;
  tisTrpTested?: string;
  specificationVersion?: string;
  transportInterface?: string;
  primaryDeviceTypeId?: string;
  applicationCategories?: string[];
}

interface MatterDeviceDetail {
  id?: string;
  manufacturer: string;
  model: string;
  deviceType?: string;
  certificationId?: string;
  certificationDate?: string;
  softwareVersion?: string;
  hardwareVersion?: string;
  vid?: string;
  pid?: string;
  familySku?: string;
  familyVariantSku?: string;
  firmwareVersion?: string;
  certificateId?: string;
  familyId?: string;
  tisTrpTested?: string;
  specificationVersion?: string;
  transportInterface?: string;
  primaryDeviceTypeId?: string;
  applicationCategories?: string[];
  url?: string;
}

// 공통 타입 정의 - DeviceBasic과 MatterDeviceDetail을 모두 포함할 수 있는 타입
type MatterDevice = DeviceBasic | MatterDeviceDetail;

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options: {
    dbPath: string;
    dataDir: string;
    reset: boolean;
    verbose: boolean;
  } = {
    dbPath: './dev-db.sqlite',
    dataDir: './data-for-dev',
    reset: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch(arg) {
      case '--db-path':
        options.dbPath = args[++i];
        break;
      case '--data-dir':
        options.dataDir = args[++i];
        break;
      case '--reset':
        options.reset = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Matter Certification Database Population Tool

Usage:
  npm run populate-dev-db -- [options]

Options:
  --db-path     Path to SQLite database file (default: ./dev-db.sqlite)
  --data-dir    Path to directory containing JSON data files (default: ./data-for-dev)
  --reset       Reset the database before importing (removes existing data)
  --verbose     Show detailed logs
        `);
        process.exit(0);
    }
  }

  return options;
}

// Initialize database and create required tables
function initializeDatabase(dbPath: string, reset: boolean): Database {
  console.log(`Initializing database at ${dbPath}`);
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = better_sqlite3(dbPath);
  
  if (reset) {
    console.log('Resetting database (dropping existing tables)');
    db.exec('DROP TABLE IF EXISTS matter_products');
    db.exec('DROP TABLE IF EXISTS app_metadata');
  }
  
  // Create tables if they don't exist
  db.exec(`CREATE TABLE IF NOT EXISTS matter_products (
    id TEXT PRIMARY KEY,
    manufacturer TEXT NOT NULL,
    model TEXT NOT NULL,
    deviceType TEXT,
    certificationId TEXT,
    certificationDate TEXT,
    softwareVersion TEXT,
    hardwareVersion TEXT,
    vid TEXT,
    pid TEXT,
    familySku TEXT,
    familyVariantSku TEXT,
    firmwareVersion TEXT,
    certificateId TEXT,
    familyId TEXT,
    tisTrpTested TEXT,
    specificationVersion TEXT,
    transportInterface TEXT,
    primaryDeviceTypeId TEXT,
    applicationCategories TEXT,
    url TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);
  
  return db;
}

// 속성 존재 여부를 안전하게 확인하는 헬퍼 함수
function safeGet<T, K extends string>(obj: T, key: K): unknown {
  return key in (obj as Record<string, unknown>) ? (obj as Record<string, unknown>)[key] : null;
}

// Process JSON files in the data directory
async function processDataFiles(dataDir: string, db: Database, verbose: boolean) {
  console.log(`Processing data files from ${dataDir}`);
  
  // Get all JSON files from the data directory
  const files = fs.readdirSync(dataDir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(dataDir, file));
  
  console.log(`Found ${files.length} JSON files`);
  
  // Prepare statements
  const insertProduct = db.prepare(`
    INSERT OR REPLACE INTO matter_products (
      id, manufacturer, model, deviceType, certificationId, certificationDate,
      softwareVersion, hardwareVersion, vid, pid, familySku, familyVariantSku,
      firmwareVersion, certificateId, familyId, tisTrpTested, specificationVersion,
      transportInterface, primaryDeviceTypeId, applicationCategories, url, createdAt, updatedAt
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  
  // Begin transaction
  const transaction = db.transaction(() => {
    let totalProducts = 0;
    const now = new Date().toISOString();
    
    // Process each file
    for (const file of files) {
      if (verbose) console.log(`Processing ${file}`);
      
      const fileData = fs.readFileSync(file, 'utf8');
      const devices = JSON.parse(fileData) as MatterDevice[];
      
      if (verbose) console.log(`Found ${devices.length} devices in ${file}`);
      
      for (const device of devices) {
        // Generate ID if not present
        const id = safeGet(device, 'id') as string || `matter-${nanoid(8)}`;
        
        // Default device type if not present
        const deviceType = safeGet(device, 'deviceType') as string || 'Matter Device';
        
        // Handle application categories
        let applicationCategories: string | null = null;
        if (safeGet(device, 'applicationCategories')) {
          applicationCategories = JSON.stringify(safeGet(device, 'applicationCategories'));
        }
        
        // 안전하게 속성에 접근
        const certificationId = safeGet(device, 'certificationId') || safeGet(device, 'certificateId');
        const certificateId = safeGet(device, 'certificateId') || safeGet(device, 'certificationId');
        
        // Insert or update product
        insertProduct.run(
          id,
          device.manufacturer,
          device.model,
          deviceType || null,
          certificationId || null,
          safeGet(device, 'certificationDate') || null,
          safeGet(device, 'softwareVersion') || null,
          safeGet(device, 'hardwareVersion') || null,
          safeGet(device, 'vid') || null,
          safeGet(device, 'pid') || null,
          safeGet(device, 'familySku') || null,
          safeGet(device, 'familyVariantSku') || null,
          safeGet(device, 'firmwareVersion') || null,
          certificateId || null,
          safeGet(device, 'familyId') || null,
          safeGet(device, 'tisTrpTested') || null,
          safeGet(device, 'specificationVersion') || null,
          safeGet(device, 'transportInterface') || null,
          safeGet(device, 'primaryDeviceTypeId') || null,
          applicationCategories,
          device.url || null,
          now,
          now
        );
        
        totalProducts++;
      }
    }
    
    // Update metadata
    const upsertMetadata = db.prepare(`
      INSERT OR REPLACE INTO app_metadata (key, value, updatedAt)
      VALUES (?, ?, ?)
    `);
    
    upsertMetadata.run('totalProducts', totalProducts.toString(), now);
    upsertMetadata.run('lastUpdated', now, now);
    
    return totalProducts;
  });
  
  // Execute transaction
  const totalProducts = transaction();
  console.log(`Imported ${totalProducts} products into the database`);
  
  return totalProducts;
}

// Main function
async function main() {
  try {
    const options = parseArgs();
    
    // Make paths absolute
    options.dbPath = path.resolve(options.dbPath);
    options.dataDir = path.resolve(options.dataDir);
    
    console.log('Starting database population...');
    console.log(`Database path: ${options.dbPath}`);
    console.log(`Data directory: ${options.dataDir}`);
    
    // Initialize database
    const db = initializeDatabase(options.dbPath, options.reset);
    
    // Process data files
    const totalProducts = await processDataFiles(options.dataDir, db, options.verbose);
    
    console.log('Database population completed successfully');
    console.log(`Total products in database: ${totalProducts}`);
    
    // Close database connection
    db.close();
    
  } catch (error) {
    console.error('Error during database population:');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();