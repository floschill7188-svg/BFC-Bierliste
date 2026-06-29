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

// Write push status results to Firestore to enable real-time debugging of VAPID delivery errors
async function logPushEvent(deviceId: string, status: 'success' | 'error', details: any) {
  try {
    const logId = `${deviceId}_${Date.now()}`;
    await setDoc(doc(db, 'push_logs', logId), {
      deviceId,
      status,
      details,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("[LOG] Failed to write push log to Firestore:", err);
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

    // De-duplicate by endpoint to prevent sending duplicate notifications to the same device/browser
    const uniqueSubsMap = new Map<string, { id: string; data: any }>();
    subSnap.docs.forEach((docSnap) => {
      const subData = docSnap.data();
      if (subData.endpoint && subData.endpoint !== 'local_notification_api_granted' && subData.endpoint.startsWith('http')) {
        uniqueSubsMap.set(subData.endpoint, { id: docSnap.id, data: subData });
      }
    });

    const promises = Array.from(uniqueSubsMap.values()).map(async ({ id, data }) => {
      const subscription = {
        endpoint: data.endpoint,
        keys: {
          auth: data.keys?.auth || '',
          p256dh: data.keys?.p256dh || ''
        }
      };

      try {
        await webpush.sendNotification(subscription, payload);
        successCount++;
        await logPushEvent(id, 'success', { action: 'broadcast', title });
      } catch (err: any) {
        console.warn(`[PUSH] Send failed for device ${id}:`, err.message);
        await logPushEvent(id, 'error', {
          action: 'broadcast',
          message: err.message,
          statusCode: err.statusCode || null,
          body: err.body || null
        });
        // Automatically prune expired or removed push endpoints (status 410 Gone / 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[PUSH] Cleaning up expired subscription: ${id}`);
          try {
            await deleteDoc(doc(db, 'push_subscriptions', id));
          } catch (delErr) {
            console.error(`[PUSH] Cleanup failed for ${id}:`, delErr);
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

// 1b. Endpoint: Register/Save Push Subscription (Server-side Firestore persistence)
app.post('/api/register-push', async (req, res) => {
  const { id, endpoint, keys, userAgent } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Missing parameter: 'id' is required." });
  }
  try {
    const subData = {
      id,
      endpoint: endpoint || '',
      keys: keys || { auth: '', p256dh: '' },
      subscribedAt: new Date().toISOString(),
      userAgent: userAgent || ''
    };
    await setDoc(doc(db, 'push_subscriptions', id), subData);
    console.log(`[PUSH_SERVER] Successfully registered device in Firestore: ${id}`);
    res.json({ success: true, message: "Subscription registered successfully on the server." });
  } catch (err: any) {
    console.error("[PUSH_SERVER] Error registering device:", err);
    res.status(500).json({ error: err.message });
  }
});

// 1c. Endpoint: Delete/Unregister Push Subscription
app.post('/api/unregister-push', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Missing parameter: 'id' is required." });
  }
  try {
    await deleteDoc(doc(db, 'push_subscriptions', id));
    console.log(`[PUSH_SERVER] Successfully unregistered device from Firestore: ${id}`);
    res.json({ success: true, message: "Subscription deleted successfully." });
  } catch (err: any) {
    console.error("[PUSH_SERVER] Error deleting subscription:", err);
    res.status(500).json({ error: err.message });
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

// 2b. Endpoint: Single Device Delayed Test Push Endpoint
app.post('/api/test-push', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: "Missing parameter: 'deviceId' is required." });
  }

  try {
    const docSnap = await getDoc(doc(db, 'push_subscriptions', deviceId));
    if (!docSnap.exists()) {
      return res.status(404).json({ 
        error: "Gerät nicht registriert", 
        message: "Dein Gerät war in unserer Datenbank nicht auffindbar. Wir haben es soeben automatisch im Hintergrund angemeldet! Bitte klicke in 2-3 Sekunden erneut auf den Button." 
      });
    }

    const data = docSnap.data();
    if (!data.endpoint || data.endpoint === 'local_notification_api_granted') {
      return res.json({ 
        success: false, 
        fallback: true,
        message: "Device is registered with fallback local notifications (full Web Push not supported by this browser/OS)." 
      });
    }

    const subscription = {
      endpoint: data.endpoint,
      keys: {
        auth: data.keys?.auth || '',
        p256dh: data.keys?.p256dh || ''
      }
    };

    const payload = JSON.stringify({
      title: '🏀 BFC Freiburg Kassenwart',
      message: 'Hintergrund-Zustellung erfolgreich! 🚀 Diese Nachricht wurde über den Server zugestellt, während die App geschlossen war!',
      url: '/'
    });

    // Schedule sending after 4 seconds to allow the user to minimize the app / lock the device
    setTimeout(async () => {
      try {
        console.log(`[PUSH] Sending delayed single-device test push to device ${deviceId}...`);
        await webpush.sendNotification(subscription, payload);
        console.log(`[PUSH] Delayed single-device test push sent successfully to ${deviceId}.`);
        await logPushEvent(deviceId, 'success', { action: 'test-push', message: 'Delayed test push sent successfully.' });
      } catch (err: any) {
        console.warn(`[PUSH] Delayed single-device test push failed for ${deviceId}:`, err.message);
        await logPushEvent(deviceId, 'error', {
          action: 'test-push',
          message: err.message,
          statusCode: err.statusCode || null,
          body: err.body || null
        });
      }
    }, 4000);

    res.json({ success: true, delayed: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2c. Diagnostic Endpoint to view subscriptions and push logs
app.get('/api/debug-push', async (req, res) => {
  try {
    const subSnap = await getDocs(collection(db, 'push_subscriptions'));
    const subs: any[] = [];
    subSnap.docs.forEach((docSnap) => {
      subs.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    const logsSnap = await getDocs(collection(db, 'push_logs'));
    const logs: any[] = [];
    logsSnap.docs.forEach((docSnap) => {
      logs.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
    // Sort logs descending by timestamp
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      vapidKeyConfigured: !!vapidKeys,
      publicKey: vapidKeys?.publicKey,
      subscriptions: subs,
      logs: logs.slice(0, 30) // last 30 logs
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cache processed notifications to ensure we don't broadcast the same notification multiple times
const processedNotifications = new Set<string>();

// Real-Time Listener on Firestore to catch any new manual/scheduler actions
function setupFirestoreListeners() {
  console.log("[FIRESTORE] Initializing real-time listeners for manual & scheduled broadcasts...");

  let isInitialLoad = true;

  onSnapshot(collection(db, 'notifications'), (snapshot) => {
    if (isInitialLoad) {
      snapshot.forEach((doc) => {
        processedNotifications.add(doc.id);
      });
      isInitialLoad = false;
      console.log(`[FIRESTORE] Initial batch of ${processedNotifications.size} notifications cached. Ignoring for real-time broadcast.`);
      return;
    }

    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const notif = change.doc.data();
        if (notif.sent && notif.sentAt && notif.type === 'manual') {
          if (!processedNotifications.has(notif.id)) {
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

// Cache processed transactions to ensure automated fine notifications only trigger once
const processedTransactions = new Set<string>();

// Real-time listener on transactions to automatically trigger push notifications for newly logged fines
function setupTransactionListener() {
  console.log("[FIRESTORE] Initializing real-time listener for automated fine transactions...");

  let isInitialLoad = true;

  onSnapshot(collection(db, 'transactions'), (snapshot) => {
    if (isInitialLoad) {
      snapshot.forEach((doc) => {
        processedTransactions.add(doc.id);
      });
      isInitialLoad = false;
      console.log(`[FIRESTORE] Initial batch of ${processedTransactions.size} transactions cached. Ignoring for real-time fine broadcast.`);
      return;
    }

    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const tx = change.doc.data();
        // Check if the transaction is a positive fine booking and has not been processed yet
        if (tx.type === 'fine' && tx.amount > 0 && !processedTransactions.has(change.doc.id)) {
          processedTransactions.add(change.doc.id);
          console.log(`[FIRESTORE] Automated fine detected: "${tx.itemName}" for player "${tx.playerName}". Broadcasting Web Push...`);

          const title = `💸 Strafe erfasst: ${tx.playerName}`;
          const message = `${tx.playerName} hat eine Strafe erhalten: "${tx.itemName}" (${tx.amount.toFixed(2)} €).`;

          const sent = await broadcastPushNotification(title, message);
          console.log(`[FIRESTORE] Automated fine broadcasted successfully to ${sent} active subscriptions.`);
        }
      }
    });
  });
}

// Calculates next occurrence of a weekly day of the week and time for preloaded reminder notifications
function getNextWeeklyOccurrenceForBootstrap(dayOfWeek: string, timeStr: string): string {
  const germanDays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const targetDayIdx = germanDays.indexOf(dayOfWeek);
  if (targetDayIdx === -1) return new Date().toISOString();

  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();

  let targetDate = new Date(now);
  targetDate.setHours(hours, minutes, 0, 0);

  let diff = targetDayIdx - now.getDay();
  // If target day is in past, or today but time passed, schedule for next week
  if (diff < 0 || (diff === 0 && now.getTime() >= targetDate.getTime())) {
    diff += 7;
  }
  targetDate.setDate(now.getDate() + diff);
  return targetDate.toISOString();
}

// Pre-populates default scheduled notifications if they do not exist
async function bootstrapDefaultNotifications() {
  console.log("[BOOTSTRAP] Checking default scheduled reminder notifications...");
  try {
    // 1. Drinks Reminder
    const drinkDocRef = doc(db, 'notifications', 'n_remind_drinks');
    const drinkDocSnap = await getDoc(drinkDocRef);
    if (!drinkDocSnap.exists()) {
      const nextTime = getNextWeeklyOccurrenceForBootstrap('Mittwoch', '21:00');
      await setDoc(drinkDocRef, {
        id: 'n_remind_drinks',
        title: '🥤 Getränke eintragen!',
        message: 'Erinnerung: Bitte tragt eure konsumierten Kaltgetränke im Kühlschrank ein, damit die Strichliste aktuell bleibt! Prost! 🍺',
        type: 'scheduled',
        scheduledTime: nextTime,
        weeklyInterval: 'Mittwoch 21:00',
        targetTeam: 'all',
        createdAt: new Date().toISOString(),
        sent: false
      });
      console.log("[BOOTSTRAP] Created default Drink Reminder scheduled notification.");
    }

    // 2. Account Balance Reminder
    const balanceDocRef = doc(db, 'notifications', 'n_remind_balance');
    const balanceDocSnap = await getDoc(balanceDocRef);
    if (!balanceDocSnap.exists()) {
      const nextTime = getNextWeeklyOccurrenceForBootstrap('Sonntag', '18:00');
      await setDoc(balanceDocRef, {
        id: 'n_remind_balance',
        title: '📊 Kontostand überprüfen!',
        message: 'Erinnerung: Bitte kontrolliert euren aktuellen Kontostand in der App und gleicht offene Beträge zeitnah aus! Danke!',
        type: 'scheduled',
        scheduledTime: nextTime,
        weeklyInterval: 'Sonntag 18:00',
        targetTeam: 'all',
        createdAt: new Date().toISOString(),
        sent: false
      });
      console.log("[BOOTSTRAP] Created default Account Balance Reminder scheduled notification.");
    }
  } catch (err) {
    console.error("[BOOTSTRAP] Error creating default notifications:", err);
  }
}

// Bootstrapper
async function start() {
  await initializeVapid();
  await bootstrapDefaultNotifications();
  setupFirestoreListeners();
  setupTransactionListener();

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
