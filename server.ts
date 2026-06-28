import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, setDoc, getDocs, onSnapshot, deleteDoc } from 'firebase/firestore';
import webpush from 'web-push';

const app = express();
const PORT = 3000;

app.use(express.json());

// Load Firebase Config
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  console.error("CRITICAL ERROR: firebase-applet-config.json was not found!");
  process.exit(1);
}
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Firebase App
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

let vapidKeys: { publicKey: string; privateKey: string } | null = null;

// Securely load or generate persistent VAPID Keys in Firestore (Zero configuration)
async function initializeVapid() {
  const vapidDocRef = doc(db, 'system_config', 'vapid_keys');
  try {
    const docSnap = await getDoc(vapidDocRef);
    if (docSnap.exists()) {
      vapidKeys = docSnap.data() as { publicKey: string; privateKey: string };
      console.log("[VAPID] Loaded existing persistent VAPID keys from Firestore.");
    } else {
      const keys = webpush.generateVAPIDKeys();
      vapidKeys = {
        publicKey: keys.publicKey,
        privateKey: keys.privateKey
      };
      await setDoc(vapidDocRef, vapidKeys);
      console.log("[VAPID] Generated and persisted new VAPID keypair in Firestore.");
    }

    webpush.setVapidDetails(
      'mailto:floschill7188@gmail.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  } catch (err) {
    console.error("[VAPID] Failed to initialize persistent keys, auto-generating local session keys:", err);
    const keys = webpush.generateVAPIDKeys();
    vapidKeys = { publicKey: keys.publicKey, privateKey: keys.privateKey };
    webpush.setVapidDetails(
      'mailto:floschill7188@gmail.com',
      keys.publicKey,
      keys.privateKey
    );
  }
}

// Broadcasts native Web Push notification payload to all registered active devices
async function broadcastPushNotification(title: string, message: string) {
  let successCount = 0;
  try {
    const subSnap = await getDocs(collection(db, 'push_subscriptions'));
    const payload = JSON.stringify({
      title,
      message,
      url: '/'
    });

    const promises = subSnap.docs.map(async (docSnap) => {
      const subData = docSnap.data();
      // Skip fallback or incomplete subscriptions
      if (!subData.endpoint || subData.endpoint === 'local_notification_api_granted' || !subData.endpoint.startsWith('http')) {
        return;
      }

      const subscription = {
        endpoint: subData.endpoint,
        keys: {
          auth: subData.keys?.auth || '',
          p256dh: subData.keys?.p256dh || ''
        }
      };

      try {
        await webpush.sendNotification(subscription, payload);
        successCount++;
      } catch (err: any) {
        console.warn(`[PUSH] Send failed for device ${docSnap.id}:`, err.message);
        // Automatically prune expired or removed push endpoints (status 410 Gone / 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[PUSH] Cleaning up expired subscription: ${docSnap.id}`);
          try {
            await deleteDoc(doc(db, 'push_subscriptions', docSnap.id));
          } catch (delErr) {
            console.error(`[PUSH] Cleanup failed for ${docSnap.id}:`, delErr);
          }
        }
      }
    });

    await Promise.all(promises);
  } catch (err) {
    console.error("[PUSH] Error in broadcast handler:", err);
  }
  return successCount;
}

// 1. Endpoint: Public VAPID Key API for clients
app.get('/api/vapid-public-key', (req, res) => {
  if (vapidKeys && vapidKeys.publicKey) {
    res.json({ publicKey: vapidKeys.publicKey });
  } else {
    res.status(503).json({ error: "VAPID keys are loading. Please try again." });
  }
});

// 2. Endpoint: Test Push Broadcast Endpoint
app.post('/api/trigger-push', async (req, res) => {
  const { title, message } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: "Missing parameters: 'title' and 'message' are required." });
  }
  try {
    const sent = await broadcastPushNotification(title, message);
    res.json({ success: true, dispatchedDevices: sent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cache processed notifications to ensure we don't broadcast the same notification multiple times
const processedNotifications = new Set<string>();

// Real-Time Listener on Firestore to catch any new manual/scheduler actions
function setupFirestoreListeners() {
  console.log("[FIRESTORE] Initializing real-time listeners for manual & scheduled broadcasts...");

  onSnapshot(collection(db, 'notifications'), (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const notif = change.doc.data();
        if (notif.sent && notif.sentAt) {
          const sentTime = new Date(notif.sentAt).getTime();
          const nowTime = Date.now();

          // Only push if created/sent within the last 5 minutes, and hasn't been broadcast yet
          if (nowTime - sentTime < 300000 && !processedNotifications.has(notif.id)) {
            processedNotifications.add(notif.id);
            console.log(`[FIRESTORE] Active notification triggered: "${notif.title}". Broadcasting Web Push...`);
            const sent = await broadcastPushNotification(notif.title, notif.message);
            console.log(`[FIRESTORE] Broadcasted successfully to ${sent} active subscriptions.`);
          }
        }
      }
    });
  });

  // Server-side continuous scheduler runner (checks every 15 seconds)
  const runScheduledChecks = async () => {
    try {
      const now = new Date();
      const notifSnap = await getDocs(collection(db, 'notifications'));

      for (const docSnap of notifSnap.docs) {
        const notif = docSnap.data();
        if (!notif.sent && notif.type === 'scheduled' && notif.scheduledTime) {
          const schedTime = new Date(notif.scheduledTime);
          if (!isNaN(schedTime.getTime()) && now.getTime() >= schedTime.getTime()) {
            console.log(`[SCHEDULER] Dispatching scheduled item: "${notif.title}"`);

            // 1. Save sent copy to Firestore
            const sentId = 'n_sent_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const sentCopy = {
              id: sentId,
              title: notif.title,
              message: notif.message,
              type: 'manual',
              targetTeam: notif.targetTeam || 'all',
              createdAt: now.toISOString(),
              sent: true,
              sentAt: now.toISOString()
            };
            await setDoc(doc(db, 'notifications', sentId), sentCopy);

            // 2. Update schedule pointer
            if (notif.weeklyInterval) {
              const nextWeekTime = new Date(schedTime.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
              const updatedSchedule = {
                ...notif,
                scheduledTime: nextWeekTime,
              };
              await setDoc(doc(db, 'notifications', notif.id), updatedSchedule);
            } else {
              const updatedSchedule = {
                ...notif,
                sent: true,
                sentAt: now.toISOString()
              };
              await setDoc(doc(db, 'notifications', notif.id), updatedSchedule);
            }
          }
        }
      }
    } catch (err) {
      console.error("[SCHEDULER] Error in check iteration:", err);
    }
  };

  setInterval(runScheduledChecks, 15000);
}

// Bootstrapper
async function start() {
  await initializeVapid();
  setupFirestoreListeners();

  // Vite Server Middleware integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Full-stack DevServer live on http://localhost:${PORT}`);
  });
}

start();
