require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3001;
const mongoUri = process.env.MONGODB_URI;

// Kiểm tra an toàn biến môi trường ngay khi khởi động nhằm tránh lỗi im lặng (Safe Fail-Fast)
if (!mongoUri) {
  console.error('❌ LỖI KHỞI ĐỘNG: Biến môi trường MONGODB_URI chưa được cấu hình trong file .env!');
  process.exit(1);
}

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

let db;

async function connectMongo() {
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db();
    
    // Create indexes for performance and constraints
    await db.collection('proposals').createIndex({ proposal_id: 1 }, { unique: true });
    await db.collection('proposals').createIndex({ created_at: -1 });
    await db.collection('votes').createIndex({ proposal_id: 1, voter: 1 }, { unique: true });
    await db.collection('members').createIndex({ address: 1 }, { unique: true });
    await db.collection('transactions').createIndex({ timestamp: -1 });
    
    console.log('✅ Connected to MongoDB successfully and indexed collections');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

// Health check
app.get('/health', async (req, res) => {
  try {
    const admin = db.admin();
    const serverStatus = await admin.serverStatus();
    
    // Check worker heartbeat
    const workerAlive = await db.collection('stats').findOne({ key: 'worker_heartbeat' });
    const workerAge = workerAlive 
      ? Date.now() - new Date(workerAlive.last_ping).getTime() 
      : Infinity;

    res.json({
      status: "ok",
      mongodb: "connected",
      worker: workerAge < 30000 ? "running" : "stale",
      uptime: serverStatus.uptime
    });
  } catch (err) {
    res.status(500).json({ status: "error", mongodb: "disconnected", code: "ERR_INTERNAL" });
  }
});

// GET /api/treasury/balance
app.get('/api/treasury/balance', async (req, res) => {
  try {
    const stats = await db.collection('stats').findOne({ key: 'treasury_balance' });
    
    let balanceStr = "0";
    let lastUpdated = null;
    if (stats) {
      if (stats.value) {
        balanceStr = typeof stats.value.toString === 'function' 
          ? stats.value.toString() 
          : String(stats.value);
      }
      lastUpdated = stats.updated_at || stats.last_updated || null;
    }

    res.json({
      balance: balanceStr,
      last_updated: lastUpdated
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: "ERR_INTERNAL" });
  }
});

// GET /api/proposals
app.get('/api/proposals', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const { status } = req.query;
    
    const filter = {};
    if (status) filter.status = status;

    const proposals = await db.collection('proposals').aggregate([
      { $match: filter },
      { $sort: { created_at: -1 } },
      { $skip: offset },
      { $limit: limit },
      {
        $lookup: {
          from: 'proposal_metadata',
          let: { d_hash: "$description_hash", r_hash: "$receipt_hash" },
          pipeline: [
            { $match: 
              { $expr: 
                { $and: [
                  { $eq: ["$description_hash", "$$d_hash"] },
                  { $eq: ["$receipt_hash", "$$r_hash"] }
                ]}
              }
            }
          ],
          as: 'metadata'
        }
      },
      { $addFields: { metadata: { $arrayElemAt: ["$metadata", 0] } } }
    ]).toArray();

    res.json(proposals);
  } catch (err) {
    res.status(500).json({ error: err.message, code: "ERR_INTERNAL" });
  }
});

// GET /api/proposals/:id
app.get('/api/proposals/:id', async (req, res) => {
  try {
    const proposalId = parseInt(req.params.id, 10);
    if (isNaN(proposalId)) {
      return res.status(400).json({ error: "Invalid proposal ID", code: "ERR_INVALID_ID" });
    }

    const proposal = await db.collection('proposals').findOne({ proposal_id: proposalId });
    
    if (!proposal) {
      return res.status(404).json({ error: "Proposal not found", code: "ERR_NOT_FOUND" });
    }

    const [vote_count, metadata] = await Promise.all([
      db.collection('votes').countDocuments({ proposal_id: proposalId }),
      db.collection('proposal_metadata').findOne({ 
        description_hash: proposal.description_hash, 
        receipt_hash: proposal.receipt_hash 
      })
    ]);

    res.json({ 
      ...proposal, 
      sub_categories: proposal.sub_categories || [], 
      vote_count, 
      metadata 
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: "ERR_INTERNAL" });
  }
});

// GET /api/proposals/:id/votes
app.get('/api/proposals/:id/votes', async (req, res) => {
  try {
    const proposalId = parseInt(req.params.id, 10);
    if (isNaN(proposalId)) {
      return res.status(400).json({ error: "Invalid proposal ID", code: "ERR_INVALID_ID" });
    }

    const votes = await db.collection('votes')
      .find({ proposal_id: proposalId })
      .sort({ timestamp: -1 })
      .toArray();

    res.json(votes);
  } catch (err) {
    res.status(500).json({ error: err.message, code: "ERR_INTERNAL" });
  }
});

// GET /api/members/:address/reputation
app.get('/api/members/:address/reputation', async (req, res) => {
  try {
    const address = req.params.address;
    const member = await db.collection('members').findOne({ address });
    
    if (!member) {
      return res.json({ address, reputation_score: 0, last_updated: null });
    }

    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message, code: "ERR_INTERNAL" });
  }
});

// GET /api/members
app.get('/api/members', async (req, res) => {
  try {
    const members = await db.collection('members')
      .find({})
      .sort({ reputation_score: -1 })
      .toArray();

    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message, code: "ERR_INTERNAL" });
  }
});

// GET /api/transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 5, 1), 50);
    const transactions = await db.collection('transactions')
      .find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message, code: "ERR_INTERNAL" });
  }
});

// POST /api/proposals/metadata
app.post('/api/proposals/metadata', async (req, res) => {
  try {
    const { title, description, receipt_urls } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required", code: "ERR_INVALID_INPUT" });
    }

    const description_hash = crypto.createHash('sha256').update(description).digest('hex');
    const receipt_hash = crypto.createHash('sha256').update(JSON.stringify(receipt_urls || [])).digest('hex');

    await db.collection('proposal_metadata').updateOne(
      { description_hash, receipt_hash },
      { 
        $set: { 
          title, 
          description, 
          receipt_urls, 
          createdAt: new Date() 
        } 
      },
      { upsert: true }
    );

    res.json({ description_hash, receipt_hash });
  } catch (err) {
    res.status(500).json({ error: err.message, code: "ERR_INTERNAL" });
  }
});

// DELETE /api/proposals/metadata/:descHash/:receiptHash (Rollback)
app.delete(['/api/proposals/metadata/:descHash', '/api/proposals/metadata/:descHash/:receiptHash'], async (req, res) => {
  try {
    const { descHash, receiptHash } = req.params;
    await db.collection('proposal_metadata').deleteOne({ 
      description_hash: descHash, 
      receipt_hash: receiptHash || ""
    });
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message, code: "ERR_INTERNAL" });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: "Internal server error", code: "ERR_INTERNAL" });
});

// Khởi chạy tuần tự hệ thống kết nối rồi mới mở cổng Port lắng nghe API
connectMongo().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Backend API Server listening at http://localhost:${port}`);
  });
}).catch(err => {
  console.error('❌ Critical system failure:', err);
  process.exit(1);
});
