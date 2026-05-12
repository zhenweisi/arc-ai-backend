import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import sqlite3 from 'sqlite3'

import OpenAI from 'openai'

import {
  createPublicClient,
  http
} from 'viem'

import { privateKeyToAccount } from 'viem/accounts'

dotenv.config()

// =====================================
// =====================================
const app = express()

app.use(cors())
app.use(express.json())

// =====================================
// =====================================
const ai = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
})

// =====================================
// =====================================
const db = new sqlite3.Database('./arc.db')

db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT UNIQUE, credits INTEGER DEFAULT 0, messagesUsed INTEGER DEFAULT 0)`)
db.run(`CREATE TABLE IF NOT EXISTS deposits (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT, txHash TEXT UNIQUE, amount TEXT, credits INTEGER, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`)
db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT, role TEXT, content TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`)

// =====================================
// =====================================
const ARC_RPC = 'https://rpc.testnet.arc.network'

const chain = {
  id: 5042002,
  name: 'ARC Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [ARC_RPC] } }
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY)
const publicClient = createPublicClient({ chain, transport: http(ARC_RPC) })

// =====================================
// =====================================
app.get('/', (req, res) => {
  res.json({ success: true, status: 'Backend Running (Minimax M2.5)' })
})

// =====================================
// =====================================
app.get('/credits/:wallet', (req, res) => {
  const wallet = req.params.wallet.toLowerCase()
  db.get(`SELECT * FROM users WHERE wallet = ?`, [wallet], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message })
    res.json({
      success: true,
      credits: row?.credits || 0,
      remainingMessages: 5 - (row?.messagesUsed || 0)
    })
  })
})

app.get('/messages/:wallet', (req, res) => {
  const wallet = req.params.wallet.toLowerCase()
  db.all(`SELECT role, content FROM messages WHERE wallet = ? ORDER BY id ASC LIMIT 30`, [wallet], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message })
    res.json({ success: true, messages: rows })
  })
})

// =====================================
// =====================================
app.post('/chat', async (req, res) => {
  try {
    const wallet = req.body.wallet?.toLowerCase()
    const message = req.body.message

    if (!wallet || !message) {
      return res.status(400).json({ success: false, error: '参数错误' })
    }

    db.get(`SELECT * FROM users WHERE wallet = ?`, [wallet], async (err, user) => {
      if (err || !user) {
        return res.status(400).json({ success: false, error: '请先充值' })
      }

      if (user.messagesUsed >= 5 || user.credits <= 0) {
        return res.status(400).json({ success: false, error: '额度不足' })
      }

      db.all(`SELECT role, content FROM messages WHERE wallet = ? ORDER BY id ASC LIMIT 10`, [wallet], async (err, historyRows) => {
        if (err) return res.status(500).json({ success: false, error: '数据库错误' })

        const history = historyRows.map(r => ({ role: r.role, content: r.content }))

        try {
          const completion = await ai.chat.completions.create({
            model: 'minimaxai/minimax-m2.7',
            
            messages: [
              { 
                role: 'system', 
                content: 'You are Arc AI. Speak naturally, friendly and intelligently. Reply in Chinese when user speaks Chinese.' 
              },
              ...history,
              { role: 'user', content: message }
            ],
            temperature: 0.7,
            max_tokens: 800,
          }, { 
            timeout: 120000 
          })

          const reply = completion.choices[0]?.message?.content || 'No response from AI'

          // 保存消息
          db.run(`INSERT INTO messages (wallet, role, content) VALUES (?, ?, ?)`, [wallet, 'user', message])
          db.run(`INSERT INTO messages (wallet, role, content) VALUES (?, ?, ?)`, [wallet, 'assistant', reply])

          // 扣除额度
          db.run(`UPDATE users SET credits = credits - 1, messagesUsed = messagesUsed + 1 WHERE wallet = ?`, [wallet])

          res.json({
            success: true,
            reply: reply,
            remainingCredits: user.credits - 1,
            remainingMessages: 5 - (user.messagesUsed + 1)
          })

        } catch (aiError) {
          console.error('AI Error:', aiError)
          res.status(500).json({
            success: false,
            error: 'AI 服务超时，请稍后再试'
          })
        }
      })
    })

  } catch (error) {
    console.error(error)
    res.status(500).json({ success: false, error: '后端错误' })
  }
})

// =====================================
// =====================================
let lastBlock = null
let scanning = false

const ARC_TRANSFER_CONTRACT = '0x1800000000000000000000000000000000000000'.toLowerCase()
const ARC_TRANSFER_TOPIC = '0x62f084c00a442dcf51cdbb51beed2839bf42a268da8474b0e98f38edb7db5a22'.toLowerCase()

async function scanBlocks() {
  if (scanning) return
  scanning = true
  try {
    const currentBlock = await publicClient.getBlockNumber()

    if (lastBlock === null) {
      lastBlock = Number(currentBlock)
      console.log(`✅ 区块监听启动，从 ${lastBlock} 开始`)
      scanning = false
      return
    }

    if (Number(currentBlock) <= lastBlock) {
      scanning = false
      return
    }

    const logs = await publicClient.getLogs({
      address: ARC_TRANSFER_CONTRACT,
      fromBlock: BigInt(lastBlock + 1),
      toBlock: currentBlock,
    })

    for (const log of logs) {
      if (log.topics?.[0]?.toLowerCase() !== ARC_TRANSFER_TOPIC) continue
      if (!log.topics[1] || !log.topics[2]) continue

      const to = '0x' + log.topics[2].slice(26).toLowerCase()
      if (to !== account.address.toLowerCase()) continue

      const value = Number(BigInt(log.data)) / 1_000_000_000_000_000_000
      const txHash = log.transactionHash
      const from = '0x' + log.topics[1].slice(26).toLowerCase()

      if (value < 1) continue

      db.get(`SELECT * FROM deposits WHERE txHash = ?`, [txHash], (err, row) => {
        if (row) return
        db.get(`SELECT * FROM users WHERE wallet = ?`, [from], (err, existing) => {
          if (existing) return
          const credits = 5
          db.run(`INSERT INTO users (wallet, credits, messagesUsed) VALUES (?, ?, 0)`, [from, credits])
          db.run(`INSERT INTO deposits (wallet, txHash, amount, credits) VALUES (?, ?, ?, ?)`, [from, txHash, value, credits])
          console.log(`✅ 充值成功！${from} 获得 5 credits`)
        })
      })
    }

    lastBlock = Number(currentBlock)
  } catch (err) {
    console.log('scanBlocks 错误:', err.message)
  } finally {
    scanning = false
  }
}

setInterval(scanBlocks, 5000)

// =====================================
// =====================================
app.listen(3001, () => {
  console.log('🚀 Arc AI Backend Running on 3001')
  console.log('📦 当前模型: minimaxai/minimax-m2.7')
  console.log('👛 Wallet:', account.address)
})
