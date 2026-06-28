import React, { useState } from 'react';
import { Notification } from '../types';
import { 
  Bell, 
  Send, 
  Calendar, 
  Clock, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  Users, 
  Volume2, 
  Zap, 
  Plus, 
  Repeat 
} from 'lucide-react';

interface NotificationManagerProps {
  notifications: Notification[];
  onAddNotification: (notif: Notification) => void;
  onDeleteNotification: (id: string) => void;
}

export default function NotificationManager({
  notifications,
  onAddNotification,
  onDeleteNotification,
}: NotificationManagerProps) {
  // Input fields state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetTeam, setTargetTeam] = useState<'all' | 'Herren 1' | 'Herren 2'>('all');
  const [scheduleMode, setScheduleMode] = useState<'instant' | 'weekly' | 'once'>('instant');
  
  // Weekly scheduler state
  const [weeklyDay, setWeeklyDay] = useState('Mittwoch');
  const [weeklyTime, setWeeklyTime] = useState('22:30');

  // Once scheduler state
  const [onceDate, setOnceDate] = useState('');
  const [onceTime, setOnceTime] = useState('18:00');

  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Helper days list
  const weekdays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

  // Calculate next occurrence of a weekday and time
  const getNextWeeklyOccurrence = (dayOfWeek: string, timeStr: string): string => {
    const germanDays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const targetDayIdx = germanDays.indexOf(dayOfWeek);
    if (targetDayIdx === -1) return new Date().toISOString();

    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    
    let targetDate = new Date(now);
    targetDate.setHours(hours, minutes, 0, 0);

    let diff = targetDayIdx - now.getDay();
    // If the target day is in the past, or is today but the time has passed, schedule for next week
    if (diff < 0 || (diff === 0 && now.getTime() >= targetDate.getTime())) {
      diff += 7;
    }
    targetDate.setDate(now.getDate() + diff);
    return targetDate.toISOString();
  };

  const handleSendOrSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setStatusMsg({ text: 'Bitte fülle Titel und Nachricht aus!', isError: true });
      return;
    }

    let newNotif: Notification;
    const nowStr = new Date().toISOString();

    if (scheduleMode === 'instant') {
      newNotif = {
        id: 'n_inst_' + Date.now(),
        title: title.trim(),
        message: message.trim(),
        type: 'manual',
        targetTeam,
        createdAt: nowStr,
        sent: true,
        sentAt: nowStr
      };
      setStatusMsg({ text: 'Push-Nachricht wurde sofort an alle Spieler gesendet! 🚀', isError: false });
    } else if (scheduleMode === 'weekly') {
      const scheduledISO = getNextWeeklyOccurrence(weeklyDay, weeklyTime);
      newNotif = {
        id: 'n_sched_w_' + Date.now(),
        title: title.trim(),
        message: message.trim(),
        type: 'scheduled',
        scheduledTime: scheduledISO, // Use the calculated ISO string!
        weeklyInterval: `${weeklyDay} ${weeklyTime}`, // Keep pattern
        targetTeam,
        createdAt: nowStr,
        sent: false,
      };
      setStatusMsg({ text: `Push-Nachricht geplant: Jeden ${weeklyDay} um ${weeklyTime} Uhr! 📅`, isError: false });
    } else {
      // Once mode
      if (!onceDate) {
        setStatusMsg({ text: 'Bitte wähle ein Datum aus!', isError: true });
        return;
      }
      const [year, month, day] = onceDate.split('-').map(Number);
      const [hours, minutes] = onceTime.split(':').map(Number);
      const scheduledDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

      if (scheduledDate.getTime() <= Date.now()) {
        setStatusMsg({ text: 'Geplante Zeit muss in der Zukunft liegen!', isError: true });
        return;
      }

      newNotif = {
        id: 'n_sched_o_' + Date.now(),
        title: title.trim(),
        message: message.trim(),
        type: 'scheduled',
        scheduledTime: scheduledDate.toISOString(),
        targetTeam,
        createdAt: nowStr,
        sent: false,
      };
      setStatusMsg({ 
        text: `Push-Nachricht einmalig geplant für den ${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year} um ${onceTime} Uhr! 📅`, 
        isError: false 
      });
    }

    onAddNotification(newNotif);
    
    // Clear inputs except target team and presets
    setTitle('');
    setMessage('');
    
    setTimeout(() => {
      setStatusMsg(null);
    }, 4000);
  };

  // Filter lists
  const scheduledList = notifications.filter(n => !n.sent);
  const sentHistoryList = notifications.filter(n => n.sent).sort((a, b) => new Date(b.sentAt || '').getTime() - new Date(a.sentAt || '').getTime());

  // Apply Quick Presets to form
  const applyPreset = (presetTitle: string, presetMsg: string) => {
    setTitle(presetTitle);
    setMessage(presetMsg);
  };

  return (
    <div className="space-y-6" id="notification-manager-container">
      {/* Alert status banner */}
      {statusMsg && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-xs font-semibold animate-fade-in ${
          statusMsg.isError ? 'bg-rose-50 border border-rose-100 text-rose-800' : 'bg-emerald-50 border border-emerald-100 text-emerald-800'
        }`}>
          {statusMsg.isError ? <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" /> : <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Grid: Creator Form & Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Creator Form (Left Column) */}
        <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Volume2 className="text-[#FF6B00] w-4 h-4" />
            Neue Benachrichtigung verfassen
          </h4>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Schnell-Vorlagen:</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('🚨 Zahlungserinnerung', 'Bitte denkt daran, eure offenen Beträge in der Mannschaftskasse zu begleichen! Euer Kassenwart.')}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:border-[#FF6B00] hover:text-[#FF6B00] text-slate-600 rounded-lg text-[10px] font-medium transition cursor-pointer"
              >
                🚨 Zahlungserinnerung
              </button>
              <button
                type="button"
                onClick={() => applyPreset('🍺 Kaltgetränke aufgefüllt!', 'Der Kühlschrank in der Kabine ist wieder randvoll mit eisgekühltem Bier und Radler! Bedient euch!')}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:border-[#FF6B00] hover:text-[#FF6B00] text-slate-600 rounded-lg text-[10px] font-medium transition cursor-pointer"
              >
                🍺 Bier aufgefüllt
              </button>
              <button
                type="button"
                onClick={() => applyPreset('🏀 Sonderspieler-Sitzung', 'Wichtige Mannschaftssitzung direkt nach dem nächsten Training am Mittwoch um 21:45 Uhr in der Kabine!')}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:border-[#FF6B00] hover:text-[#FF6B00] text-slate-600 rounded-lg text-[10px] font-medium transition cursor-pointer"
              >
                🏀 Sitzung planen
              </button>
            </div>
          </div>

          <form onSubmit={handleSendOrSchedule} className="space-y-4">
            {/* Title & Team */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 block mb-1">Betreff / Titel</label>
                <input
                  type="text"
                  placeholder="z.B. Mahnung oder Spieltag-Kasten"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#FF6B00] text-slate-800 font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1">Empfänger (Team)</label>
                <select
                  value={targetTeam}
                  onChange={(e) => setTargetTeam(e.target.value as any)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#FF6B00] text-slate-800 font-semibold"
                >
                  <option value="all">Alle Spieler</option>
                  <option value="Herren 1">Herren 1</option>
                  <option value="Herren 2">Herren 2</option>
                </select>
              </div>
            </div>

            {/* Message Body */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 block mb-1">Nachrichtentext</label>
              <textarea
                placeholder="Schreibe hier die Mitteilung, die an die Handys bzw. Bildschirme der Spieler gepusht wird..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#FF6B00] text-slate-800"
              />
            </div>

            {/* Scheduling Config */}
            <div className="border-t border-slate-200 pt-4 space-y-3">
              <label className="text-[10px] font-bold text-slate-500 block">Sendezeitpunkt konfigurieren</label>
              
              {/* Radio Selector */}
              <div className="flex gap-2 bg-white p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setScheduleMode('instant')}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition ${
                    scheduleMode === 'instant' ? 'bg-[#FF6B00] text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Sofort senden
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('weekly')}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition ${
                    scheduleMode === 'weekly' ? 'bg-[#FF6B00] text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Wöchentlich
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('once')}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition ${
                    scheduleMode === 'once' ? 'bg-[#FF6B00] text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Einmalig planen
                </button>
              </div>

              {/* Conditional Schedulers */}
              {scheduleMode === 'weekly' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-white border border-slate-100 rounded-xl animate-fade-in">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Wochentag</label>
                    <select
                      value={weeklyDay}
                      onChange={(e) => setWeeklyDay(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#FF6B00]"
                    >
                      {weekdays.map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Uhrzeit</label>
                    <input
                      type="time"
                      value={weeklyTime}
                      onChange={(e) => setWeeklyTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#FF6B00] text-center font-mono"
                    />
                  </div>
                </div>
              )}

              {scheduleMode === 'once' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-white border border-slate-100 rounded-xl animate-fade-in">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Datum</label>
                    <input
                      type="date"
                      value={onceDate}
                      onChange={(e) => setOnceDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#FF6B00] font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Uhrzeit</label>
                    <input
                      type="time"
                      value={onceTime}
                      onChange={(e) => setOnceTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#FF6B00] text-center font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-[#FF6B00] to-amber-500 hover:from-[#e05e00] hover:to-amber-600 text-white rounded-xl text-xs font-black transition shadow-sm hover:shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              {scheduleMode === 'instant' ? (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Push-Nachricht sofort abfeuern 🚀
                </>
              ) : (
                <>
                  <Calendar className="w-3.5 h-3.5" />
                  Als geplante Push-Mitteilung speichern 📅
                </>
              )}
            </button>
          </form>
        </div>

        {/* Lists (Right Column) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Scheduled List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h5 className="text-xs font-bold text-slate-800 flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-500" />
              Aktive Zeitpläne ({scheduledList.length})
            </h5>

            {scheduledList.length === 0 ? (
              <p className="text-[10px] text-slate-400 py-6 text-center border border-dashed border-slate-150 rounded-xl">
                Keine geplanten Nachrichten vorhanden.
              </p>
            ) : (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {scheduledList.map(n => (
                  <div key={n.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-black text-slate-800 truncate block">{n.title}</span>
                      <p className="text-[9px] text-slate-500 truncate">{n.message}</p>
                      
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[8px] bg-amber-100 border border-amber-200 text-amber-700 px-1 rounded-sm font-bold flex items-center gap-0.5">
                          <Clock className="w-2 h-2" />
                          {n.weeklyInterval 
                            ? `Jeden ${n.weeklyInterval} (Nächstes: ${new Date(n.scheduledTime || '').toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })})`
                            : n.scheduledTime && n.scheduledTime.includes('T')
                              ? new Date(n.scheduledTime).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
                              : n.scheduledTime}
                        </span>
                        <span className="text-[8px] bg-slate-200 text-slate-600 px-1 rounded-sm font-bold flex items-center gap-0.5">
                          <Users className="w-2 h-2" />
                          {n.targetTeam === 'all' ? 'Alle' : n.targetTeam}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteNotification(n.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Sendeplan löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sent History List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h5 className="text-xs font-bold text-slate-800 flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              Verlauf gesendeter Nachrichten ({sentHistoryList.length})
            </h5>

            {sentHistoryList.length === 0 ? (
              <p className="text-[10px] text-slate-400 py-6 text-center border border-dashed border-slate-150 rounded-xl">
                Noch kein Verlauf aufgezeichnet.
              </p>
            ) : (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {sentHistoryList.map(n => (
                  <div key={n.id} className="p-2.5 bg-slate-50/60 border border-slate-100 rounded-xl flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-slate-700 truncate block flex items-center gap-1.5">
                        <Zap className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                        {n.title}
                      </span>
                      <p className="text-[9px] text-slate-400 truncate">{n.message}</p>
                      <div className="flex gap-1.5 mt-1 text-[8px] text-slate-400 font-mono">
                        <span>Gesendet am: {new Date(n.sentAt || n.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        <span>•</span>
                        <span>Gruppe: {n.targetTeam === 'all' ? 'Alle' : n.targetTeam}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteNotification(n.id)}
                      className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Aus Verlauf löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
