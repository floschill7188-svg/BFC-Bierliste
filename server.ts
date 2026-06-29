import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, setDoc, getDocs, onSnapshot, deleteDoc } from 'firebase/firestore';

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

// 1. Scheduler Runner for scheduled reminder notifications (checks every 15 seconds)
function startNotificationScheduler() {
  console.log("[SCHEDULER] Initializing server-side automated notification scheduler...");
  
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

// 2. Cache processed transactions to ensure automated fine notifications only trigger once
const processedTransactions = new Set<string>();

// Real-time listener on transactions to automatically trigger inside-app notifications for newly logged fines
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
          console.log(`[FIRESTORE] Automated fine detected: "${tx.itemName}" for player "${tx.playerName}". Triggering in-app notification...`);

          const notifId = 'n_auto_fine_' + change.doc.id;
          const title = `💸 Strafe erfasst: ${tx.playerName}`;
          const message = `${tx.playerName} hat eine Strafe erhalten: "${tx.itemName}" (${tx.amount.toFixed(2)} €).`;

          const notifDoc = {
            id: notifId,
            title,
            message,
            type: 'manual',
            targetTeam: 'all',
            createdAt: new Date().toISOString(),
            sent: true,
            sentAt: new Date().toISOString()
          };

          try {
            await setDoc(doc(db, 'notifications', notifId), notifDoc);
            console.log(`[FIRESTORE] Auto-generated fine notification added in Firestore: ${notifId}`);
          } catch (err) {
            console.error("[FIRESTORE] Failed to auto-generate fine notification in Firestore:", err);
          }
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
  // If target day is in past, today but time passed, schedule for next week
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

// Start Server
async function start() {
  await bootstrapDefaultNotifications();
  startNotificationScheduler();
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
