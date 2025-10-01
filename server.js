
require('dotenv').config(); // load .env
//Import librarys
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');// call the mangodb library
const bcrypt = require('bcryptjs');// to hash passwords
const jwt = require('jsonwebtoken');// to create auth tokens    

// create an app instance
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
// reads environment variables from a .env file
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'graphEditor';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-change-me';
const PORT = Number(process.env.PORT) || 3000;
// if the mango db url is not defined, exit the application
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI missing in .env');
  process.exit(1);
}
// make a mangodb client instance
const client = new MongoClient(MONGODB_URI);
let Users, Graphs;

//make a token for the user that expire in 7 days
function makeToken(user) {
  return jwt.sign({ uid: user._id.toString(), username: user.username }, JWT_SECRET, {
    expiresIn: '7d'
  });
}
// varify the token and get the user id and username from it
function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const [, token] = hdr.split(' ');
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = { uid: payload.uid, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
// check if the user can read the graph (owner or shared with)
function canReadGraph(user, graph) {
  if (!graph) return false;
  if (graph.ownerUserId.toString() === user.uid) return true;
  return (graph.sharedWithUsernames || []).includes(user.username);
}
// check if the user is the owner of the graph
function isOwner(user, graph) {
  return graph.ownerUserId.toString() === user.uid;
}

// signup new user with username and password, checks if the credentials are valid and hash the password before storing it in the database
app.post('/auth/signup', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const existing = await Users.findOne({ username });
  if (existing) return res.status(409).json({ error: 'username already taken' });

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await Users.insertOne({ username, passwordHash, createdAt: new Date() });

  const user = { _id: result.insertedId, username };
  const token = makeToken(user);
  res.json({ token, username });
});

// login existing user by checking the credentials and return a token if they are valid
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const user = await Users.findOne({ username });
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const token = makeToken(user);
  res.json({ token, username: user.username });
});
// get the username of the current user (from token)
app.get('/api/me', requireAuth, async (req, res) => {
  res.json({ username: req.auth.username });
});


// List graphs you own + graphs shared with you
app.get('/api/graphs', requireAuth, async (req, res) => {
  const me = req.auth;

  const owned = await Graphs.find({ ownerUserId: new ObjectId(me.uid) })
    .project({ title: 1, updatedAt: 1, type: 1 })
    .toArray();

  const shared = await Graphs.find({
    ownerUserId: { $ne: new ObjectId(me.uid) },
    sharedWithUsernames: me.username
  })
    .project({ title: 1, updatedAt: 1, type: 1 })
    .toArray();

  res.json({ owned, shared });
});

// create graph and insert it into the database 
app.post('/api/graphs', requireAuth, async (req, res) => {
  const { title, type, nodes, links } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });

  const cleanNodes = Array.isArray(nodes)
    ? nodes.map(n => ({
        id: String(n.id),
        label: n.label,
        x: typeof n.x === 'number' ? n.x : undefined,
        y: typeof n.y === 'number' ? n.y : undefined
      }))
    : [];

  const cleanLinks = Array.isArray(links)
    ? links.map(e => ({
        source: (typeof e.source === 'object') ? String(e.source.id) : String(e.source),
        target: (typeof e.target === 'object') ? String(e.target.id) : String(e.target),
        ...(e.weight != null ? { weight: Number(e.weight) } : {})
      }))
    : [];

  const doc = {
    ownerUserId: new ObjectId(req.auth.uid),
    title,
    type: type || 'force',
    nodes: cleanNodes,
    links: cleanLinks,
    sharedWithUsernames: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await Graphs.insertOne(doc);
  res.status(201).json({ _id: result.insertedId.toString(), ...doc });
});

// Read the graph and return it if the user has access
app.get('/api/graphs/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'bad id' });

  const graph = await Graphs.findOne({ _id: new ObjectId(id) });
  if (!canReadGraph(req.auth, graph)) return res.status(403).json({ error: 'forbidden' });

  res.json({ ...graph, _id: graph._id.toString() });
});

// update graph only the owner can update the graph, the user can update nodes and links of the graph
app.put('/api/graphs/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'bad id' });

  const graph = await Graphs.findOne({ _id: new ObjectId(id) });
  if (!graph) return res.status(404).json({ error: 'not found' });
  if (!isOwner(req.auth, graph)) return res.status(403).json({ error: 'owner only' });

  const patch = {};
  if ('title' in req.body) patch.title = req.body.title;

  if (Array.isArray(req.body.nodes)) {
    patch.nodes = req.body.nodes.map(n => ({
      id: String(n.id),
      label: n.label,
      x: typeof n.x === 'number' ? n.x : undefined,
      y: typeof n.y === 'number' ? n.y : undefined
    }));
  }
  if (Array.isArray(req.body.links)) {
    patch.links = req.body.links.map(e => ({
      source: (typeof e.source === 'object') ? String(e.source.id) : String(e.source),
      target: (typeof e.target === 'object') ? String(e.target.id) : String(e.target),
      ...(e.weight != null ? { weight: Number(e.weight) } : {})
    }));
  }

  patch.updatedAt = new Date();
  await Graphs.updateOne({ _id: graph._id }, { $set: patch });
  const updated = await Graphs.findOne({ _id: graph._id });
  res.json({ ...updated, _id: updated._id.toString() });
});

// SHARE with another username (owner only can share the graph)
app.post('/api/graphs/:id/share', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { username } = req.body || {};
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'bad id' });
  if (!username) return res.status(400).json({ error: 'username required' });

  const graph = await Graphs.findOne({ _id: new ObjectId(id) });
  if (!graph) return res.status(404).json({ error: 'not found' });
  if (!isOwner(req.auth, graph)) return res.status(403).json({ error: 'owner only' });

  const targetUser = await Users.findOne({ username });
  if (!targetUser) return res.status(404).json({ error: 'user not found' });

  await Graphs.updateOne(
    { _id: graph._id },
    { $addToSet: { sharedWithUsernames: username }, $set: { updatedAt: new Date() } }
  );
  res.json({ ok: true });
});

//Delete graph (owner only). Deleting removes it for everyone wich the graph is shared too
app.delete('/api/graphs/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'bad id' });

  const graph = await Graphs.findOne({ _id: new ObjectId(id) });
  if (!graph) return res.status(404).json({ error: 'not found' });
  if (!isOwner(req.auth, graph)) return res.status(403).json({ error: 'owner only' });

  await Graphs.deleteOne({ _id: graph._id });
  res.json({ ok: true });
});

// run the server and connect to the database, exit if it fails
async function main() {
  await client.connect();
  const db = client.db(DB_NAME);
  Users = db.collection('users');
  Graphs = db.collection('graphs');

  app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
    console.log('Connected to MongoDB');
  });
}

main().catch(err => {
  console.error('Mongo connect failed:', err);
  process.exit(1);
});
