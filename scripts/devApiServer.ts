/**
 * Development API Server
 * 
 * This script starts an Express server that provides API endpoints for
 * accessing the SQLite database. It's used during development to test
 * the application with real database interactions instead of mock data.
 * 
 * Usage:
 *   npm run dev:api
 * 
 * Environment variables:
 *   PORT - The port to run the server on (default: 3001)
 *   DB_PATH - Path to the SQLite database file (default: ./dev-db.sqlite)
 */

import express from 'express';
import cors from 'cors';
import { Database } from 'better-sqlite3';
import better_sqlite3 from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// Convert __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../dev-db.sqlite');

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// SQLite 결과 타입 정의
interface SQLiteCountResult {
  total: number;
}

interface SQLiteMetadataResult {
  key: string;
  value: string;
  updatedAt: string;
}

// Initialize database
let db: Database;
try {
  console.log(`Opening SQLite database at: ${DB_PATH}`);
  db = better_sqlite3(DB_PATH, { readonly: false });
  console.log('Database opened successfully');
} catch (err) {
  console.error('Error opening database:', err);
  process.exit(1);
}

// Helper function to parse application categories
function parseApplicationCategories(categoriesJson: string | null): string[] {
  if (!categoriesJson) return [];
  try {
    return JSON.parse(categoriesJson);
  } catch (err) {
    console.warn('Error parsing application categories:', err);
    return [];
  }
}

// Format a database row to match MatterProduct interface
function formatProduct(row: any) {
  return {
    ...row,
    applicationCategories: parseApplicationCategories(row.applicationCategories),
    certificationDate: row.certificationDate || null,
  };
}

// API Routes
app.get('/api/products', (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    const countStmt = db.prepare('SELECT COUNT(*) as total FROM matter_products');
    const countResult = countStmt.get() as SQLiteCountResult;
    const total = countResult.total;
    
    const stmt = db.prepare(`
      SELECT * FROM matter_products
      ORDER BY manufacturer, model
      LIMIT ? OFFSET ?
    `);
    
    const rows = stmt.all(limit, offset);
    const products = rows.map(formatProduct);
    
    res.json({ products, total });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const stmt = db.prepare('SELECT * FROM matter_products WHERE id = ?');
    const row = stmt.get(id);
    
    if (!row) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(formatProduct(row));
  } catch (err) {
    console.error('Error fetching product by ID:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/search', (req, res) => {
  try {
    const query = req.query.query as string || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    const searchParam = `%${query}%`;
    
    const countStmt = db.prepare(`
      SELECT COUNT(*) as total FROM matter_products
      WHERE manufacturer LIKE ? OR model LIKE ? OR deviceType LIKE ? OR certificationId LIKE ?
    `);
    const countResult = countStmt.get(searchParam, searchParam, searchParam, searchParam) as SQLiteCountResult;
    const total = countResult.total;
    
    const stmt = db.prepare(`
      SELECT * FROM matter_products
      WHERE manufacturer LIKE ? OR model LIKE ? OR deviceType LIKE ? OR certificationId LIKE ?
      ORDER BY manufacturer, model
      LIMIT ? OFFSET ?
    `);
    
    const rows = stmt.all(searchParam, searchParam, searchParam, searchParam, limit, offset);
    const products = rows.map(formatProduct);
    
    res.json({ products, total });
  } catch (err) {
    console.error('Error searching products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/database/summary', (req, res) => {
  try {
    const totalProductsStmt = db.prepare('SELECT COUNT(*) as total FROM matter_products');
    const totalResult = totalProductsStmt.get() as SQLiteCountResult;
    const total = totalResult.total;
    
    const metadataStmt = db.prepare('SELECT * FROM app_metadata WHERE key = ?');
    const lastUpdatedData = metadataStmt.get('lastUpdated') as SQLiteMetadataResult | undefined;
    const newlyAddedData = metadataStmt.get('newlyAddedCount') as SQLiteMetadataResult | undefined;
    
    const lastUpdated = lastUpdatedData ? new Date(lastUpdatedData.value) : null;
    const newlyAddedCount = newlyAddedData ? parseInt(newlyAddedData.value, 10) : 0;
    
    res.json({
      totalProducts: total,
      lastUpdated,
      newlyAddedCount,
    });
  } catch (err) {
    console.error('Error fetching database summary:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/database/update-summary', (req, res) => {
  try {
    const { newlyAddedCount } = req.body;
    const now = new Date().toISOString();
    
    const stmt = db.prepare('INSERT OR REPLACE INTO app_metadata (key, value, updatedAt) VALUES (?, ?, ?)');
    stmt.run('lastUpdated', now, now);
    stmt.run('newlyAddedCount', newlyAddedCount.toString(), now);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating database summary:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Development API server running at http://localhost:${PORT}`);
});