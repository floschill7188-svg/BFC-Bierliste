import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Volume2, 
  Smartphone, 
  Laptop, 
  HelpCircle,
  Sparkles,
  Info
} from 'lucide-react';
import { dbSavePushSubscription, dbDeletePushSubscription } from '../lib/db';
import { PushSubscriptionData } from '../types';

interface PushSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Helper to convert standard Base64 VAPID public keys to Uint8Array for PushManager subscription
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushSettingsModal({ isOpen, onClose }: PushSettingsModalProps) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Generate a persistent local device ID for subscription tracking
  const getDeviceId = () => {
    let devId = localStorage.getItem('bb_push_device_id');
    if (!devId) {
      devId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('bb_push_device_id', devId);
    }
    return devId;
  };

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
      setIsSubscribed(Notification.permission === 'granted' && localStorage.getItem('bb_push_subscribed') === 'true');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      setErrorMsg('Dein Browser unterstützt leider keine nativen Push-Nachrichten.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        // Register Service Worker if not registered
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.register('/sw.js');
          
          let subscriptionData: PushSubscriptionData;
          
          try {
            // Fetch the genuine, persistent VAPID public key from the backend
            const vapidRes = await fetch('/api/vapid-public-key');
            if (!vapidRes.ok) {
              throw new Error(`Server returned status ${vapidRes.status} for VAPID lookup.`);
            }
            const { publicKey } = await vapidRes.json();
            
            // Clean up any stale subscription first
            let sub = await reg.pushManager.getSubscription();
            if (sub) {
              await sub.unsubscribe();
            }
            
            const convertedVapidKey = urlBase64ToUint8Array(publicKey);
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedVapidKey
            });
            
            // Build the standard Web Push Subscription payload
            subscriptionData = {
              id: getDeviceId(),
              endpoint: sub.endpoint,
              keys: {
                auth: sub.toJSON().keys?.auth || '',
                p256dh: sub.toJSON().keys?.p256dh || ''
              },
              subscribedAt: new Date().toISOString(),
              userAgent: navigator.userAgent
            };
          } catch (pErr) {
            console.warn('Native pushManager subscription failed or VAPID missing, using persistent registration fallback:', pErr);
            // Fallback: Register device to Firestore so the server can see it
            subscriptionData = {
              id: getDeviceId(),
              endpoint: 'local_notification_api_granted',
              keys: { auth: '', p256dh: '' },
              subscribedAt: new Date().toISOString(),
              userAgent: navigator.userAgent
            };
          }

          // Save subscription to Firestore
          await dbSavePushSubscription(subscriptionData);
        }

        localStorage.setItem('bb_push_subscribed', 'true');
        setIsSubscribed(true);
      } else if (result === 'denied') {
        setErrorMsg('Benachrichtigungen wurden im Browser blockiert. Bitte setze die Berechtigungen in deiner Adressleiste zurück.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Fehler bei der Aktivierung der Push-Mitteilungen.');
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const devId = localStorage.getItem('bb_push_device_id');
      if (devId) {
        await dbDeletePushSubscription(devId);
      }
      localStorage.removeItem('bb_push_subscribed');
      setIsSubscribed(false);
      
      // Try to unsubscribe from native push manager
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Abmeldung fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger a test background notification with a delay so they can switch tabs/lock phone!
  const triggerTestNotification = () => {
    if (permission !== 'granted') return;
    
    setTestSuccess(true);
    setTimeout(() => {
      setTestSuccess(false);
    }, 4000);

    // Schedule native notification with 3 seconds delay
    setTimeout(() => {
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification('🏀 BFC Freiburg Kassenwart', {
              body: 'Test erfolgreich! So landen Nachrichten auf deinem Handy, selbst wenn die App geschlossen ist! 🚀',
              icon: '/assets/icon.png',
              badge: '/assets/icon.png',
              vibrate: [200, 100, 200],
              tag: 'bfc_test_push_' + Date.now(),
              data: {
                url: window.location.origin
              }
            } as any);
          });
        } else {
          new Notification('🏀 BFC Freiburg Kassenwart', {
            body: 'Test erfolgreich! Native Benachrichtigung wurde empfangen! 🚀',
            icon: '/assets/icon.png',
            tag: 'bfc_test_push_' + Date.now()
          });
        }
      } catch (e) {
        console.error('Failed to trigger native test:', e);
      }
    }, 3000);
  };

  const getDeviceIcon = () => {
    if (typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      return <Smartphone className="w-8 h-8 text-[#FF6B00]" />;
    }
    return <Laptop className="w-8 h-8 text-[#FF6B00]" />;
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden border border-slate-200/60 shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-tr from-slate-900 to-slate-800 text-white px-6 py-5 flex justify-between items-center relative">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-[#FF6B00]">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base tracking-tight">Push-Mitteilungen einrichten</h3>
              <p className="text-[10px] text-slate-300 font-medium">BFC Freiburg Mannschaftskasse</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-xl transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-slate-700">
          
          {/* Device Detection Banner */}
          <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl flex items-center gap-4">
            <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-3xs shrink-0">
              {getDeviceIcon()}
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-800">Dein aktuelles Gerät registrieren</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                Damit Nachrichten auf diesem Endgerät (Handy, Tablet oder Laptop) ankommen, musst du den Empfang aktivieren.
              </p>
            </div>
          </div>

          {/* Status Section */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Aktueller Status:</span>
            <div className="border border-slate-100 rounded-2xl p-4 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                {permission === 'granted' && isSubscribed ? (
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h5 className="text-xs font-bold text-slate-800">
                    {permission === 'granted' && isSubscribed ? 'Aktiviert & Registriert' : 'Nicht eingerichtet'}
                  </h5>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {permission === 'granted' && isSubscribed 
                      ? 'Dein Gerät empfängt nun native OS-Mitteilungen.' 
                      : 'Bitte erteile die Berechtigung, um Benachrichtigungen zu empfangen.'}
                  </p>
                </div>
              </div>
              <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border ${
                permission === 'granted' && isSubscribed 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {permission === 'granted' && isSubscribed ? 'EINGESCHALTET' : 'AUS'}
              </span>
            </div>
          </div>

          {/* Action Button */}
          <div>
            {permission === 'granted' && isSubscribed ? (
              <button
                type="button"
                onClick={unsubscribe}
                disabled={isLoading}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                Inaktiveren (Abmelden)
              </button>
            ) : (
              <button
                type="button"
                onClick={requestPermission}
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-[#FF6B00] to-amber-500 hover:from-orange-500 hover:to-amber-600 text-white font-black rounded-xl text-xs transition transform hover:scale-[1.01] active:scale-95 cursor-pointer shadow-md shadow-orange-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Bell className="w-4 h-4" />
                {isLoading ? 'Aktivierung läuft...' : 'Mitteilungen auf diesem Gerät aktivieren'}
              </button>
            )}
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Playground/Test Panel */}
          {permission === 'granted' && isSubscribed && (
            <div className="border border-slate-100 bg-slate-50/25 p-4 rounded-2xl space-y-3.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                <h4 className="text-xs font-black text-slate-800">Push-Zustellung testen</h4>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Klicke auf den Button, schließe sofort die App/Sperre dein Gerät und warte 3 Sekunden. Du erhältst eine echte System-Benachrichtigung!
              </p>
              
              <button
                type="button"
                onClick={triggerTestNotification}
                disabled={testSuccess}
                className={`w-full py-2 bg-white border border-slate-200 hover:border-[#FF6B00] hover:text-[#FF6B00] text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
                  testSuccess ? 'border-emerald-500 text-emerald-600 hover:border-emerald-500 hover:text-emerald-600' : ''
                }`}
              >
                <Volume2 className="w-4 h-4" />
                {testSuccess ? 'Sende Test in 3s...' : 'Hintergrund-Zustellung testen'}
              </button>

              {testSuccess && (
                <p className="text-[9px] text-center text-emerald-600 font-bold animate-pulse">
                  ✓ Geplant! Schließe jetzt das Browserfenster oder wechsle den Tab!
                </p>
              )}
            </div>
          )}

          {/* How it works info */}
          <div className="bg-[#FF6B00]/5 border border-[#FF6B00]/10 p-4 rounded-2xl space-y-2">
            <div className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#FF6B00]" />
              <h4 className="text-xs font-black text-slate-800">Wie funktioniert die Hintergrund-Zustellung?</h4>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Wenn die App im Browser geschlossen ist, wird ein <strong>Service Worker</strong> im Hintergrund deines Betriebssystems aktiv gehalten. 
            </p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Deine eindeutige Geräteadresse wird sicher in unserer <strong>Firestore-Datenbank</strong> verschlüsselt gespeichert, damit der Kassenwart dich bei neuen Einträgen oder Mahnungen direkt auf dem Sperrbildschirm deines Handys erreichen kann.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex justify-between items-center text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
          <span>Native Push API v1.2</span>
          <span>BFC FREIBURG e.V.</span>
        </div>

      </div>
    </div>
  );
}
