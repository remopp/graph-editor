require('dotenv').config(); // load .env

//this imports the libs we use in the api server
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb'); // this is the mongodb client
const bcrypt = require('bcryptjs'); // this hashes passwords
const jwt = require('jsonwebtoken'); // this creates auth tokens

//this creates the express app
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

//this reads envs and sets defaults
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'graphEditor';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-change-me';
const PORT = Number(process.env.PORT) || 3000;

//this checks that db url exists
if (!MONGODB_URI) {
  console.error('MONGODB_URI missing in .env');
  process.exit(1);
}

//this makes a single mongo client we reuse
const client = new MongoClient(MONGODB_URI);
let Users, Graphs;

//this makes a jwt token that expires in 7 days
function makeToken(user) {
  return jwt.sign({ uid: user._id.toString(), username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

//this middleware checks the token
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


//this checks if the user is the owner (owner can do everything)
function isOwner(user, graph) {
  return graph?.ownerUserId?.toString?.() === user?.uid;
}

//this checks if the user can read (owner or shared with)
function canReadGraph(user, graph) {
  if (!graph) return false;
  if (isOwner(user, graph)) return true;
  if ((graph.sharedWithUsernames || []).includes(user.username)) return true; // old type read
  return (graph.shares || []).some(s => s?.username === user.username); // viewer or editor
}

//this checks if the user can edit (owner or share role is editor)
function isEditor(user, graph) {
  if (!graph) return false;
  if (isOwner(user, graph)) return true;
  return (graph.shares || []).some(s => s?.username === user.username && s?.role === 'editor');
}


//this signs up a user with username+password and returns a token
app.post('/auth/signup', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const existing = await Users.findOne({ username });
  if (existing) return res.status(409).json({ error: 'username already taken' });

  const passwordHash = await bcrypt.hash(password, 10);
  const out = await Users.insertOne({ username, passwordHash, createdAt: new Date() });
  const user = { _id: out.insertedId, username };
  const token = makeToken(user);
  res.json({ token, username });
});

//this logs in a user and returns a token
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const user = await Users.findOne({ username });
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const token = makeToken(user);
  res.json({ token, username });
});

//this returns the current user (used by dashboard header)
app.get('/api/me', requireAuth, async (req, res) => {
  const me = await Users.findOne({ _id: new ObjectId(req.auth.uid) }, { projection: { username: 1 } });
  if (!me) return res.status(401).json({ error: 'not found' });
  res.json({ username: me.username });
});

//this lists owned graphs and graphs shared with the user (old type and new (with the viewer/editor role))
app.get('/api/graphs', requireAuth, async (req, res) => {
  const me = { uid: req.auth.uid, username: req.auth.username };

  const owned = await Graphs.find({ ownerUserId: new ObjectId(me.uid) })
    .project({ title: 1, updatedAt: 1, type: 1 })
    .sort({ updatedAt: -1 })
    .toArray();

  const shared = await Graphs.find({
    ownerUserId: { $ne: new ObjectId(me.uid) },
    $or: [
      { sharedWithUsernames: me.username },
      { shares: { $elemMatch: { username: me.username } } }
    ]
  })
    .project({ title: 1, updatedAt: 1, type: 1 })
    .sort({ updatedAt: -1 })
    .toArray();

  res.json({
    owned: owned.map(g => ({ ...g, _id: g._id.toString() })),
    shared: shared.map(g => ({ ...g, _id: g._id.toString() }))
  });
});


//this creates a new empty graph owned by the caller
app.post('/api/graphs', requireAuth, async (req, res) => {
  const { title, type, nodes, links } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });

  //this normalizes the nodes so the shape is predictable
  const cleanNodes = Array.isArray(nodes)
    ? nodes.map(n => ({
        id: String(n.id),
        label: (n.label == null ? undefined : String(n.label)),
        description: (n.description == null ? undefined : String(n.description)),
        x: (typeof n.x === 'number' ? n.x : undefined),
        y: (typeof n.y === 'number' ? n.y : undefined),
        fx: (typeof n.fx === 'number' ? n.fx : undefined),
        fy: (typeof n.fy === 'number' ? n.fy : undefined),
        layer: (typeof n.layer === 'number' ? n.layer : undefined),
      }))
    : [];

  //this normalizes links (source/target become ids, weight optional)
  const cleanLinks = Array.isArray(links)
    ? links.map(e => ({
        source: (typeof e.source === 'object') ? String(e.source.id) : String(e.source),
        target: (typeof e.target === 'object') ? String(e.target.id) : String(e.target),
        ...(e.weight != null ? { weight: Number(e.weight) } : {})
      }))
    : [];

  //this is the document we store
  const doc = {
    ownerUserId: new ObjectId(req.auth.uid),
    title,
    type: type || 'force',
    nodes: cleanNodes,
    links: cleanLinks,
    shares: [],
    sharedWithUsernames: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const out = await Graphs.insertOne(doc);
  res.json({ _id: out.insertedId.toString() });
});


//this returns the full graph plus an access field so ui can show read-only
app.get('/api/graphs/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'bad id' });

  const graph = await Graphs.findOne({ _id: new ObjectId(id) });
  if (!graph) return res.status(404).json({ error: 'not found' });
  if (!canReadGraph(req.auth, graph)) return res.status(403).json({ error: 'forbidden' });

  const access = isOwner(req.auth, graph) ? 'owner' : (isEditor(req.auth, graph) ? 'editor' : 'viewer');
  res.json({ ...graph, _id: graph._id.toString(), access });
});


//this updates a graph
app.put('/api/graphs/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'bad id' });

  const graph = await Graphs.findOne({ _id: new ObjectId(id) });
  if (!graph) return res.status(404).json({ error: 'not found' });
  if (!isEditor(req.auth, graph)) return res.status(403).json({ error: 'forbidden_readonly' });

  //this builds a patch so we only set fields that the client sent
  const patch = {};

  if (typeof req.body.title === 'string') patch.title = req.body.title;
  if (typeof req.body.type === 'string')  patch.type = req.body.type;

  // Merge behavior: positions only updates merge; full saves replace
  if (Array.isArray(req.body.nodes)) {
    const incoming = req.body.nodes.map(n => ({
      id: String(n.id),
      label: (n.label == null ? undefined : String(n.label)),
      description: (n.description == null ? undefined : String(n.description)),
      x: (typeof n.x === 'number' ? n.x : undefined),
      y: (typeof n.y === 'number' ? n.y : undefined),
      fx: (typeof n.fx === 'number' ? n.fx : undefined),
      fy: (typeof n.fy === 'number' ? n.fy : undefined),
      layer: (typeof n.layer === 'number' ? n.layer : undefined),
    }));

    const treatAsFullReplace = Array.isArray(req.body.links);
    if (treatAsFullReplace) {
      // Full save from client: honor deletions and ID changes by replacing set
      patch.nodes = incoming;
    } else {
      // Positions only: merge by id, preserve description, keep unspecified nodes
      const byId = new Map((graph.nodes || []).map(n => [String(n.id), n]));
      const merged = incoming.map(n => {
        const prev = byId.get(String(n.id)) || {};
        return {
          ...prev,
          ...n,
          description: (n.description == null ? prev.description : n.description),
        };
      });

      const mentioned = new Set(incoming.map(n => String(n.id)));
      for (const old of (graph.nodes || [])) {
        if (!mentioned.has(String(old.id))) merged.push(old); // keep nodes that were not sent
      }
      patch.nodes = merged;
    }
  }

  //this normalizes links (like in create)
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


//this shares a graph with a username and role = viewer|editor (default viewer)
app.post('/api/graphs/:id/share', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { username, role } = req.body || {};
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'bad id' });
  if (!username) return res.status(400).json({ error: 'username required' });

  const graph = await Graphs.findOne({ _id: new ObjectId(id) });
  if (!graph) return res.status(404).json({ error: 'not found' });
  if (!isOwner(req.auth, graph)) return res.status(403).json({ error: 'owner only' });

  const targetUser = await Users.findOne({ username });
  if (!targetUser) return res.status(404).json({ error: 'user not found' });

  const safeRole = (role === 'editor' || role === 'viewer') ? role : 'viewer';

  //this ensures shares array exists, removes old entry for username, then adds the new one
  const shares = Array.isArray(graph.shares) ? graph.shares.filter(s => s.username !== username) : [];
  shares.push({ username, role: safeRole });

  await Graphs.updateOne(
    { _id: graph._id },
    { $set: { shares, updatedAt: new Date() } }
  );

  //this keeps old type list for back compat (acts like viewer)
  await Graphs.updateOne(
    { _id: graph._id },
    { $addToSet: { sharedWithUsernames: username } }
  );

  res.json({ ok: true });
});


//this deletes a graph if the user owns it
app.delete('/api/graphs/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'bad id' });

  const graph = await Graphs.findOne({ _id: new ObjectId(id) });
  if (!graph) return res.status(404).json({ error: 'not found' });
  if (!isOwner(req.auth, graph)) return res.status(403).json({ error: 'owner only' });

  await Graphs.deleteOne({ _id: graph._id });
  res.json({ ok: true });
});


//this connects to mongo and starts the http server
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