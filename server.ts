import express from 'express';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Firestore on server for API routes if config exists
let db: any = null;
try {
  if (fs.existsSync('./firebase-applet-config.json')) {
    const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    const firebaseApp = initializeApp(config);
    db = getFirestore(firebaseApp, config.firestoreDatabaseId);
    console.log("[SERVER] Firestore connected for API routes");
  }
} catch (err) {
  console.error("[SERVER] Could not initialize Firestore:", err);
}

// Helper: Load SMTP config from File or Firestore or Env
async function getSmtpConfigData() {
  let host = process.env.SMTP_HOST || '';
  let port = process.env.SMTP_PORT || '587';
  let user = process.env.SMTP_USER || '';
  let pass = process.env.SMTP_PASS || '';
  let from = process.env.SMTP_FROM || 'BFC Bierbot <noreply@bfc.de>';

  // Check local file backup first
  try {
    if (fs.existsSync('./smtp-config.json')) {
      const fileData = JSON.parse(fs.readFileSync('./smtp-config.json', 'utf8'));
      if (fileData.host) host = fileData.host;
      if (fileData.port) port = fileData.port;
      if (fileData.user) user = fileData.user;
      if (fileData.pass) pass = fileData.pass;
      if (fileData.from) from = fileData.from;
    }
  } catch (e) {
    console.error("[SERVER] Could not read ./smtp-config.json:", e);
  }

  // Check Firestore if available
  if (db) {
    try {
      const smtpDoc = await getDoc(doc(db, 'settings', 'smtp'));
      if (smtpDoc.exists()) {
        const data = smtpDoc.data();
        if (data.host) host = data.host;
        if (data.port) port = data.port;
        if (data.user) user = data.user;
        if (data.pass) pass = data.pass;
        if (data.from) from = data.from;
      }
    } catch (e) {
      console.error("[SERVER] Could not fetch SMTP config from Firestore:", e);
    }
  }

  return { host, port, user, pass, from };
}

// Helper: Get SMTP Transporter
async function getTransporter() {
  const config = await getSmtpConfigData();
  const host = config.host;
  const port = parseInt(config.port || '587', 10);
  const user = config.user;
  const pass = config.pass;
  const from = config.from || 'BFC Bierbot <noreply@bfc.de>';

  if (!host || !user || !pass) {
    return { 
      transporter: null, 
      from, 
      error: 'SMTP ist noch nicht vollständig eingerichtet. Bitte Host, Benutzername und Passwort eingeben.' 
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    }
  });

  return { transporter, from, error: null };
}

// Helper: Get payment info for emails
async function getPaymentInfo() {
  let paypalInfo = 'PayPal: f-schill@t-online.de';
  let weroInfo = 'Wero: +49 171 1903588';

  if (db) {
    try {
      const appDoc = await getDoc(doc(db, 'settings', 'app'));
      if (appDoc.exists()) {
        const data = appDoc.data();
        if (data.paypalInfo) paypalInfo = data.paypalInfo;
        if (data.weroInfo) weroInfo = data.weroInfo;
      }
    } catch (e) {
      console.error("[SERVER] Could not fetch payment info:", e);
    }
  }

  return { paypalInfo, weroInfo };
}

// Helper: Generate HTML email template
function generateEmailHtml(name: string, betrag: number, paypalInfo: string, weroInfo: string, appUrl?: string, h1Betrag?: number, h2Betrag?: number) {
  const currentUrl = appUrl || process.env.APP_URL || 'https://bfc-bierbot.run.app';
  const hasTeamSplit = h1Betrag !== undefined && h2Betrag !== undefined && (h1Betrag !== 0 || h2Betrag !== 0);

  const teamBreakdownHtml = hasTeamSplit ? `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin: 14px 0; font-family: monospace;">
      <div style="font-weight: bold; margin-bottom: 6px; font-family: Arial, sans-serif; font-size: 13px; color: #475569;">Aufteilung nach Mannschaftskasse:</div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="color: #ea580c; font-weight: bold;">🏀 Herren 1:</span>
        <span style="font-weight: bold; color: ${h1Betrag > 0 ? '#dc2626' : '#16a34a'};">${h1Betrag.toFixed(2)} €</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #2563eb; font-weight: bold;">🏀 Herren 2:</span>
        <span style="font-weight: bold; color: ${h2Betrag > 0 ? '#dc2626' : '#16a34a'};">${h2Betrag.toFixed(2)} €</span>
      </div>
    </div>
  ` : '';

  if (betrag > 17) {
    return `
      <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 550px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #ea580c; margin-top: 0; font-size: 20px;">🍺 BFC Bierbot - Dein Bierkontostand</h2>
        <p>Hallo <strong>${name}</strong>,</p>
        <p style="font-size: 16px;">Dein aktueller Bierkontostand beträgt: <strong style="font-size: 18px; color: #dc2626;">${betrag.toFixed(2)} €</strong></p>
        ${teamBreakdownHtml}
        <p style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; font-weight: bold; color: #991b1b; border-radius: 4px;">
          ⚠️ Bitte gleiche dein Konto möglichst bald aus!
        </p>
        <p style="margin-top: 20px;">
          📊 <strong>Bierliste & Details:</strong><br>
          <a href="${currentUrl}" style="color: #2563eb; font-weight: bold; text-decoration: underline;">Zur Vereins-App öffnen</a>
        </p>
        <p style="margin-top: 16px;">
          💸 <strong>Zahlungsmöglichkeiten:</strong><br>
          PayPal: ${paypalInfo}<br>
          Wero: ${weroInfo}
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #64748b; font-size: 13px;">Vielen Dank & Prost!<br>– Dein BFC Bierbot 🍻</p>
      </div>
    `;
  } else if (betrag > 0) {
    return `
      <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 550px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #16a34a; margin-top: 0; font-size: 20px;">🍺 BFC Bierbot - Dein Bierkontostand</h2>
        <p>Hallo <strong>${name}</strong>,</p>
        <p style="font-size: 16px;">Dein aktueller Bierkontostand beträgt: <strong style="font-size: 18px; color: #16a34a;">${betrag.toFixed(2)} €</strong></p>
        ${teamBreakdownHtml}
        <p style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px; font-weight: bold; color: #166534; border-radius: 4px;">
          Alles im grünen Bereich! 🍀
        </p>
        <p style="margin-top: 20px;">
          📊 <strong>Bierliste & Details:</strong><br>
          <a href="${currentUrl}" style="color: #2563eb; font-weight: bold; text-decoration: underline;">Zur Vereins-App öffnen</a>
        </p>
        <p style="margin-top: 16px;">
          💸 <strong>Zahlungsmöglichkeiten (optional):</strong><br>
          PayPal: ${paypalInfo}<br>
          Wero: ${weroInfo}
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #64748b; font-size: 13px;">Viele Grüße & Prost!<br>– Dein BFC Bierbot 🍻</p>
      </div>
    `;
  } else {
    return `
      <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 550px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #16a34a; margin-top: 0; font-size: 20px;">🍺 BFC Bierbot - Dein Bierkontostand</h2>
        <p>Hallo <strong>${name}</strong>,</p>
        <p style="font-size: 16px;">Dein aktueller Bierkontostand beträgt: <strong style="font-size: 18px; color: #16a34a;">0,00 €</strong></p>
        ${teamBreakdownHtml}
        <p style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px; font-weight: bold; color: #166534; border-radius: 4px;">
          Dein Konto ist ausgeglichen. Vielen Dank! 🎉
        </p>
        <p style="margin-top: 20px;">
          📊 <strong>Bierliste & Details:</strong><br>
          <a href="${currentUrl}" style="color: #2563eb; font-weight: bold; text-decoration: underline;">Zur Vereins-App öffnen</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #64748b; font-size: 13px;">Viele Grüße & Prost!<br>– Dein BFC Bierbot 🍻</p>
      </div>
    `;
  }
}

// API Route for Weekly Balances (Google Apps Script / Webhook bridge)
app.get('/api/weekly-balances', async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Firestore database not connected' });
  }

  try {
    const [playersSnap, drinksSnap, finesSnap, txSnap] = await Promise.all([
      getDocs(collection(db, 'players')),
      getDocs(collection(db, 'drinks')),
      getDocs(collection(db, 'fines')),
      getDocs(collection(db, 'transactions'))
    ]);

    const drinks: any[] = [];
    drinksSnap.forEach(d => drinks.push({ id: d.id, ...d.data() }));

    const fines: any[] = [];
    finesSnap.forEach(f => fines.push({ id: f.id, ...f.data() }));

    const txs: any[] = [];
    txSnap.forEach(t => txs.push({ id: t.id, ...t.data() }));

    const result: any[] = [];

    playersSnap.forEach(docSnap => {
      const p: any = docSnap.data();
      const playerTxs = txs.filter(t => t.playerId === docSnap.id || (t.playerName && t.playerName.toLowerCase() === (p.name || '').toLowerCase()));

      let h1Cost = 0;
      let h1Paid = 0;
      let h2Cost = 0;
      let h2Paid = 0;

      if (playerTxs.length > 0) {
        for (const t of playerTxs) {
          const qty = Number(t.quantity || 1);
          const amt = Number(t.amount || 0);
          const tTeam = t.team === 'Herren 2' ? 'Herren 2' : 'Herren 1';
          if (t.type === 'drink' || t.type === 'fine') {
            if (tTeam === 'Herren 2') h2Cost += amt * qty;
            else h1Cost += amt * qty;
          } else if (t.type === 'payment') {
            if (tTeam === 'Herren 2') h2Paid += amt * qty;
            else h1Paid += amt * qty;
          }
        }
      } else {
        const tStats = p.teamStats || {};
        const h1DCount = tStats['Herren 1']?.drinksCount || p.drinksCount || {};
        const h1FCount = tStats['Herren 1']?.finesCount || p.finesCount || {};
        h1Paid = Number(tStats['Herren 1']?.totalPaid ?? p.totalPaid ?? 0);

        const h2DCount = tStats['Herren 2']?.drinksCount || {};
        const h2FCount = tStats['Herren 2']?.finesCount || {};
        h2Paid = Number(tStats['Herren 2']?.totalPaid ?? 0);

        h1Cost = Object.entries(h1DCount).reduce((acc, [dId, q]) => {
          const drink = drinks.find(d => d.id === dId);
          return acc + (drink ? drink.price * Number(q) : 0);
        }, 0) + Object.entries(h1FCount).reduce((acc, [fId, q]) => {
          const fine = fines.find(f => f.id === fId);
          return acc + (fine ? fine.amount * Number(q) : 0);
        }, 0);

        h2Cost = Object.entries(h2DCount).reduce((acc, [dId, q]) => {
          const drink = drinks.find(d => d.id === dId);
          return acc + (drink ? drink.price * Number(q) : 0);
        }, 0) + Object.entries(h2FCount).reduce((acc, [fId, q]) => {
          const fine = fines.find(f => f.id === fId);
          return acc + (fine ? fine.amount * Number(q) : 0);
        }, 0);
      }

      const h1Balance = Number((h1Cost - h1Paid).toFixed(2));
      const h2Balance = Number((h2Cost - h2Paid).toFixed(2));
      const isMultiTeam = (p.teams && p.teams.length > 1) || (p.teams?.includes('Herren 1') && p.teams?.includes('Herren 2'));
      const totalCost = Number((h1Cost + h2Cost).toFixed(2));
      const totalPaid = Number((h1Paid + h2Paid).toFixed(2));
      const offenerBetrag = Number((totalCost - totalPaid).toFixed(2));

      result.push({
        id: docSnap.id,
        name: p.name || '',
        email: p.email || '',
        betrag: offenerBetrag,
        h1Balance,
        h2Balance,
        isMultiTeam,
        totalCost,
        totalPaid
      });
    });

    res.json(result);
  } catch (err: any) {
    console.error("[SERVER] Error fetching weekly balances:", err);
    res.status(500).json({ error: err.message || 'Failed to fetch balances' });
  }
});

// GET /api/smtp-config -> fetch configured SMTP settings (without pass)
app.get('/api/smtp-config', async (req, res) => {
  try {
    const config = await getSmtpConfigData();
    res.json({
      host: config.host || '',
      port: config.port || '587',
      user: config.user || '',
      from: config.from || 'BFC Bierbot <noreply@bfc.de>',
      hasPass: !!config.pass
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/smtp-config -> save SMTP settings
app.post('/api/smtp-config', async (req, res) => {
  const { host, port, user, pass, from } = req.body || {};

  try {
    // Read existing config first to retain pass if unchanged
    const currentConfig = await getSmtpConfigData();

    const newConfig: any = {
      host: String(host ?? currentConfig.host ?? ''),
      port: String(port ?? currentConfig.port ?? '587'),
      user: String(user ?? currentConfig.user ?? ''),
      from: String(from ?? currentConfig.from ?? 'BFC Bierbot <noreply@bfc.de>'),
      pass: pass !== undefined && pass !== '' ? String(pass) : (currentConfig.pass || '')
    };

    // 1. Write to local JSON file as backup
    try {
      fs.writeFileSync('./smtp-config.json', JSON.stringify(newConfig, null, 2), 'utf8');
      console.log("[SERVER] SMTP config saved to ./smtp-config.json");
    } catch (fileErr) {
      console.error("[SERVER] Failed to save ./smtp-config.json:", fileErr);
    }

    // 2. Write to Firestore if connected
    if (db) {
      try {
        await setDoc(doc(db, 'settings', 'smtp'), newConfig, { merge: true });
        console.log("[SERVER] SMTP config saved to Firestore");
      } catch (fsErr: any) {
        console.error("[SERVER] Failed to save SMTP config to Firestore:", fsErr);
      }
    }

    res.json({ success: true, message: 'SMTP-Konfiguration erfolgreich gespeichert' });
  } catch (err: any) {
    console.error("[SERVER] Error saving SMTP config:", err);
    res.status(500).json({ error: 'Fehler beim Speichern: ' + err.message });
  }
});

// POST /api/test-smtp -> test SMTP connection
app.post('/api/test-smtp', async (req, res) => {
  const { transporter, error } = await getTransporter();
  if (error || !transporter) {
    return res.status(400).json({ success: false, error: error || 'Kein Transporter' });
  }

  try {
    await transporter.verify();
    res.json({ success: true, message: 'SMTP-Verbindung war erfolgreich!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'SMTP-Test fehlgeschlagen: ' + err.message });
  }
});

// POST /api/send-email -> Send email to a single recipient
app.post('/api/send-email', async (req, res) => {
  const { to, name, betrag, customMessage, h1Betrag, h2Betrag, isMultiTeam } = req.body;

  if (!to || !name) {
    return res.status(400).json({ error: 'E-Mail-Adresse und Name sind erforderlich' });
  }

  const { transporter, from, error } = await getTransporter();
  if (error || !transporter) {
    return res.status(400).json({ error });
  }

  const { paypalInfo, weroInfo } = await getPaymentInfo();
  const htmlBody = customMessage 
    ? `<div style="font-family: Arial, sans-serif; color: #1e293b; padding: 20px;">
        <p>Hallo <strong>${name}</strong>,</p>
        <p style="white-space: pre-wrap;">${customMessage}</p>
        <p style="margin-top: 16px;">
          💸 <strong>Zahlung:</strong><br>
          PayPal: ${paypalInfo}<br>
          Wero: ${weroInfo}
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #64748b; font-size: 13px;">– Dein BFC Bierbot 🍻</p>
      </div>`
    : generateEmailHtml(
        name, 
        Number(betrag || 0), 
        paypalInfo, 
        weroInfo, 
        undefined, 
        isMultiTeam && h1Betrag !== undefined ? Number(h1Betrag) : undefined, 
        isMultiTeam && h2Betrag !== undefined ? Number(h2Betrag) : undefined
      );

  const subject = customMessage 
    ? "BFC Bierbot - Nachricht von deinem Trainer/Admin 🍺" 
    : "BFC Bierbot - Dein Bierkontostand 🍺";

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html: htmlBody
    });

    console.log(`[SERVER] Email sent to ${to}:`, info.messageId);
    res.json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    console.error(`[SERVER] Failed to send email to ${to}:`, err);
    res.status(500).json({ error: 'Fehler beim Senden der E-Mail: ' + err.message });
  }
});

// POST /api/send-weekly-emails -> Bulk send emails to all players with registered emails
app.post('/api/send-weekly-emails', async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Firestore database not connected' });
  }

  const { transporter, from, error } = await getTransporter();
  if (error || !transporter) {
    return res.status(400).json({ error });
  }

  try {
    const { paypalInfo, weroInfo } = await getPaymentInfo();
    const [playersSnap, drinksSnap, finesSnap, txSnap] = await Promise.all([
      getDocs(collection(db, 'players')),
      getDocs(collection(db, 'drinks')),
      getDocs(collection(db, 'fines')),
      getDocs(collection(db, 'transactions'))
    ]);

    const drinks: any[] = [];
    drinksSnap.forEach(d => drinks.push({ id: d.id, ...d.data() }));

    const fines: any[] = [];
    finesSnap.forEach(f => fines.push({ id: f.id, ...f.data() }));

    const txs: any[] = [];
    txSnap.forEach(t => txs.push({ id: t.id, ...t.data() }));

    const sentTo: string[] = [];
    const errors: string[] = [];

    for (const docSnap of playersSnap.docs) {
      const p: any = docSnap.data();
      const email = p.email?.trim();
      const name = p.name?.trim();

      if (!email || !name) continue;

      const playerTxs = txs.filter(t => t.playerId === docSnap.id || (t.playerName && t.playerName.toLowerCase() === name.toLowerCase()));

      let h1Cost = 0;
      let h1Paid = 0;
      let h2Cost = 0;
      let h2Paid = 0;

      if (playerTxs.length > 0) {
        for (const t of playerTxs) {
          const qty = Number(t.quantity || 1);
          const amt = Number(t.amount || 0);
          const tTeam = t.team === 'Herren 2' ? 'Herren 2' : 'Herren 1';
          if (t.type === 'drink' || t.type === 'fine') {
            if (tTeam === 'Herren 2') h2Cost += amt * qty;
            else h1Cost += amt * qty;
          } else if (t.type === 'payment') {
            if (tTeam === 'Herren 2') h2Paid += amt * qty;
            else h1Paid += amt * qty;
          }
        }
      } else {
        const tStats = p.teamStats || {};
        const h1DCount = tStats['Herren 1']?.drinksCount || p.drinksCount || {};
        const h1FCount = tStats['Herren 1']?.finesCount || p.finesCount || {};
        h1Paid = Number(tStats['Herren 1']?.totalPaid ?? p.totalPaid ?? 0);

        const h2DCount = tStats['Herren 2']?.drinksCount || {};
        const h2FCount = tStats['Herren 2']?.finesCount || {};
        h2Paid = Number(tStats['Herren 2']?.totalPaid ?? 0);

        h1Cost = Object.entries(h1DCount).reduce((acc, [dId, q]) => {
          const drink = drinks.find(d => d.id === dId);
          return acc + (drink ? drink.price * Number(q) : 0);
        }, 0) + Object.entries(h1FCount).reduce((acc, [fId, q]) => {
          const fine = fines.find(f => f.id === fId);
          return acc + (fine ? fine.amount * Number(q) : 0);
        }, 0);

        h2Cost = Object.entries(h2DCount).reduce((acc, [dId, q]) => {
          const drink = drinks.find(d => d.id === dId);
          return acc + (drink ? drink.price * Number(q) : 0);
        }, 0) + Object.entries(h2FCount).reduce((acc, [fId, q]) => {
          const fine = fines.find(f => f.id === fId);
          return acc + (fine ? fine.amount * Number(q) : 0);
        }, 0);
      }

      const h1Balance = Number((h1Cost - h1Paid).toFixed(2));
      const h2Balance = Number((h2Cost - h2Paid).toFixed(2));
      const isMultiTeam = (p.teams && p.teams.length > 1) || (p.teams?.includes('Herren 1') && p.teams?.includes('Herren 2'));
      const offenerBetrag = Number((h1Balance + h2Balance).toFixed(2));

      const subject = "BFC Bierbot - Dein Bierkontostand 🍺";
      const htmlBody = generateEmailHtml(
        name, 
        offenerBetrag, 
        paypalInfo, 
        weroInfo, 
        undefined, 
        isMultiTeam ? h1Balance : undefined, 
        isMultiTeam ? h2Balance : undefined
      );

      try {
        await transporter.sendMail({
          from,
          to: email,
          subject,
          html: htmlBody
        });
        sentTo.push(`${name} (${email})`);
      } catch (sendErr: any) {
        console.error(`[SERVER] Error sending to ${email}:`, sendErr);
        errors.push(`${name}: ${sendErr.message}`);
      }
    }

    res.json({
      success: true,
      count: sentTo.length,
      sentTo,
      errors
    });
  } catch (err: any) {
    console.error("[SERVER] Bulk email error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start Server
async function start() {
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
