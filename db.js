import sqlite3 from 'sqlite3'

const db = new sqlite3.Database('./relay.db')

db.serialize(() => {

  // 用户额度
  db.run(`
    CREATE TABLE IF NOT EXISTS users (

      id INTEGER PRIMARY KEY AUTOINCREMENT,

      wallet TEXT UNIQUE,

      credits INTEGER DEFAULT 0,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // 支付记录
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (

      id INTEGER PRIMARY KEY AUTOINCREMENT,

      wallet TEXT,

      tx_hash TEXT UNIQUE,

      amount REAL,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

})

export default db