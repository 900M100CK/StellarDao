require('dotenv').config();
const { MongoClient } = require('mongodb');

async function initDb() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    
    console.log('Creating indexes...');
    
    await db.collection('proposals').createIndex({ proposal_id: 1 }, { unique: true });
    await db.collection('proposals').createIndex({ status: 1, created_at: -1 });
    await db.collection('votes').createIndex({ proposal_id: 1, voter: 1 }, { unique: true });
    await db.collection('members').createIndex({ address: 1 }, { unique: true });
    await db.collection('transactions').createIndex({ tx_hash: 1 }, { unique: true });
    await db.collection('transactions').createIndex({ timestamp: -1 });
    await db.collection('stats').createIndex({ key: 1 }, { unique: true });

    console.log('Indexes created successfully');
  } catch (err) {
    console.error('Error creating indexes:', err);
  } finally {
    await client.close();
  }
}

initDb();
