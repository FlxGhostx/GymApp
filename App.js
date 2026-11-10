import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

/* ═══════════════════════════════ THEME ═══════════════════════════════ */

const C = {
  bg: '#121214',
  surface: '#1a1a1e',
  surface2: '#222227',
  border: '#2a2a31',
  text: '#f4f4f5',
  sub: '#a1a1aa',
  dim: '#6b6b74',
  em: '#10b981',
  emSoft: 'rgba(16,185,129,0.12)',
  emLine: 'rgba(16,185,129,0.40)',
  onEm: '#04140d',
};

/* ═══════════════════════════════ DATA ═══════════════════════════════ */

const MUSCLES = ['Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps', 'Core'];
const MIN_WEEKLY_SETS = 4;
const VISUAL_WEEKLY_TARGET = 10;

// startWeight in kg; repLow/repHigh drive double progression
const EXERCISES = [
  { id: 'bench', name: 'Barbell Bench Press', muscle: 'Chest', startWeight: 40, repLow: 6, repHigh: 8, sets: 3 },
  { id: 'incline_db', name: 'Incline DB Press', muscle: 'Chest', startWeight: 16, repLow: 8, repHigh: 10, sets: 3 },
  { id: 'cable_fly', name: 'Cable Fly', muscle: 'Chest', startWeight: 10, repLow: 10, repHigh: 12, sets: 3 },
  { id: 'row', name: 'Barbell Row', muscle: 'Back', startWeight: 40, repLow: 6, repHigh: 8, sets: 3 },
  { id: 'pulldown', name: 'Lat Pulldown', muscle: 'Back', startWeight: 40, repLow: 8, repHigh: 10, sets: 3 },
  { id: 'squat', name: 'Back Squat', muscle: 'Quads', startWeight: 50, repLow: 6, repHigh: 8, sets: 3 },
  { id: 'leg_press', name: 'Leg Press', muscle: 'Quads', startWeight: 80, repLow: 8, repHigh: 10, sets: 3 },
  { id: 'leg_ext', name: 'Leg Extension', muscle: 'Quads', startWeight: 30, repLow: 10, repHigh: 12, sets: 3 },
  { id: 'rdl', name: 'Romanian Deadlift', muscle: 'Hamstrings', startWeight: 50, repLow: 6, repHigh: 8, sets: 3 },
  { id: 'leg_curl', name: 'Lying Leg Curl', muscle: 'Hamstrings', startWeight: 30, repLow: 10, repHigh: 12, sets: 3 },
  { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', startWeight: 30, repLow: 6, repHigh: 8, sets: 3 },
  { id: 'lateral', name: 'Lateral Raise', muscle: 'Shoulders', startWeight: 8, repLow: 10, repHigh: 12, sets: 3 },
  { id: 'curl', name: 'Barbell Curl', muscle: 'Biceps', startWeight: 20, repLow: 8, repHigh: 10, sets: 3 },
  { id: 'hammer', name: 'Hammer Curl', muscle: 'Biceps', startWeight: 12, repLow: 8, repHigh: 10, sets: 3 },
  { id: 'pushdown', name: 'Cable Pushdown', muscle: 'Triceps', startWeight: 20, repLow: 10, repHigh: 12, sets: 3 },
  { id: 'skull', name: 'Skull Crusher', muscle: 'Triceps', startWeight: 20, repLow: 8, repHigh: 10, sets: 3 },
  { id: 'cable_crunch', name: 'Cable Crunch', muscle: 'Core', startWeight: 25, repLow: 10, repHigh: 12, sets: 3 },
  { id: 'leg_raise', name: 'Hanging Leg Raise', muscle: 'Core', startWeight: 0, repLow: 10, repHigh: 15, sets: 3 },
];
const EX_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

const SET_TYPES = {
  standard: { label: 'Standard', short: null, desc: 'Rigid working set. Drives progression.' },
  warmup: { label: 'Warmup', short: 'W', desc: '~50% load. Excluded from weekly volume.' },
  drop: { label: 'Drop Set', short: 'D', desc: '~80% of the previous set, straight after it.' },
  failure: { label: 'To Failure', short: 'F', desc: 'Same load, go until technical failure.' },
};

const KEYS = { logs: '@overload/logs/v1', settings: '@overload/settings/v1' };
const DEFAULT_SETTINGS = {
  restSeconds: 90,
  deloadUntil: null, // epoch ms; deload active while now < deloadUntil
  plateauResetDay: null, // sessions on/before this day are ignored for plateau detection
  autoDeload: true,
  widgetEnabled: true,
};
const REST_PRESETS = [60, 90, 120];
const DAY_MS = 86400000;

const CH_WIDGET = 'workout-widget';
const CH_REST = 'rest-timer';
const WIDGET_ID = 'overload-active-workout';
const REST_ID = 'overload-rest-timer';

/* ═══════════════════════════════ UTILS ═══════════════════════════════ */

const dayKey = (ts = Date.now()) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const round05 = (x) => Math.round(x * 2) / 2;
const fmtW = (w) => (Number.isInteger(w) ? String(w) : Number(w).toFixed(1));
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const loadIncrement = (w) => Math.min(5, Math.max(1, round05(w * 0.1))); // 20kg -> +2kg, 100kg -> +5kg
const cleanNum = (t) => t.replace(',', '.').replace(/[^0-9.]/g, '');

/* ═══════════════════ PROGRESSIVE OVERLOAD ENGINE ═══════════════════ */

// Summarise one day of logs for an exercise using only rigid standard sets.
function evaluateSession(day, sets) {
  const std = sets.filter((s) => s.setType === 'standard');
  if (!std.length) return null;
  const weight = Math.max(...std.map((s) => s.weight));
  const top = std.find((s) => s.weight === weight);
  const met = std.every((s) => s.reps >= s.targetReps && s.weight >= s.targetWeight);
  return {
    day,
    weight,
    reps: top.targetReps,
    setCount: std.length,
    met,
    deload: sets.some((s) => s.deload),
  };
}

function computePlan(ex, logs, settings, today, deloadActive) {
  const mine = logs.filter((l) => l.exerciseId === ex.id);
  const pr = mine.filter((l) => l.setType !== 'warmup').reduce((m, l) => Math.max(m, l.weight), 0);

  // Group previous days (today is excluded so targets stay stable mid-session)
  const byDay = {};
  for (const l of mine) if (l.day < today) (byDay[l.day] = byDay[l.day] || []).push(l);
  const sessions = Object.keys(byDay)
    .sort()
    .reverse()
    .map((d) => evaluateSession(d, byDay[d]))
    .filter(Boolean);

  // Deload-week sessions don't move the baseline: after recovery we resume from pre-deload numbers.
  const normal = sessions.filter((s) => !s.deload);
  const ref = normal[0] || sessions[0] || null;

  const base = ref ? { weight: ref.weight, reps: ref.reps } : { weight: ex.startWeight, reps: ex.repLow };

  let rec = null;
  if (ref && ref.met) {
    if (ref.weight === 0) {
      rec = { weight: 0, reps: ref.reps + 1, reason: `Hit ${ref.setCount}×${ref.reps} last session — add a rep` };
    } else if (ref.reps >= ex.repHigh) {
      rec = {
        weight: round05(ref.weight + loadIncrement(ref.weight)),
        reps: ex.repLow,
        reason: `Hit ${ref.setCount}×${ref.reps} @ ${fmtW(ref.weight)}kg — increase load`,
      };
    } else {
      rec = {
        weight: ref.weight,
        reps: ref.reps + 1,
        reason: `Hit ${ref.setCount}×${ref.reps} @ ${fmtW(ref.weight)}kg — add a rep`,
      };
    }
  }

  // Plateau: target reps missed on the last 2 consecutive (non-deload) sessions since the last reset.
  const recent = normal.filter((s) => !settings.plateauResetDay || s.day > settings.plateauResetDay).slice(0, 2);
  const plateau = recent.length === 2 && recent.every((s) => !s.met);

  // Deload: scale every recommendation back by 10%.
  let deloadTarget = null;
  if (deloadActive) {
    const src = rec || base;
    deloadTarget = {
      weight: round05(src.weight * 0.9),
      reps: src.reps,
      reason: `Deload week: −10% from ${fmtW(src.weight)}kg to manage fatigue`,
    };
  }

  return {
    pr,
    last: ref,
    base,
    rec: deloadTarget || rec,
    isDeloadRec: !!deloadTarget,
    plateau,
    prefill: deloadTarget || base,
    sets: ex.sets,
  };
}

function freshRow(target, type = 'standard') {
  return {
    key: uid(),
    type,
    weight: fmtW(target.weight),
    reps: String(target.reps),
    targetWeight: target.weight,
    targetReps: target.reps,
    logId: null,
  };
}

function buildRows(plan, todayLogs) {
  const logged = [...todayLogs].sort((a, b) => a.ts - b.ts);
  const rows = logged.map((l) => ({
    key: l.id,
    type: l.setType,
    weight: fmtW(l.weight),
    reps: String(l.reps),
    targetWeight: l.targetWeight,
    targetReps: l.targetReps,
    logId: l.id,
  }));
  const stdDone = logged.filter((l) => l.setType === 'standard').length;
  for (let i = stdDone; i < plan.sets; i++) rows.push(freshRow(plan.prefill));
  return rows;
}

/* ═══════════════════════════ NOTIFICATIONS ═══════════════════════════ */

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const kind = n.request.content.data?.kind;
    if (kind === 'rest') {
      // In the foreground the in-app banner + haptics handle it.
      return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
  },
});

async function initNotifications() {
  if (Platform.OS !== 'android') return false;
  try {
    await Notifications.setNotificationChannelAsync(CH_WIDGET, {
      name: 'Active workout',
      importance: Notifications.AndroidImportance.LOW,
      showBadge: false,
      enableVibrate: false,
      sound: null,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(CH_REST, {
      name: 'Rest timer',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 150, 100, 150],
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    return status === 'granted';
  } catch {
    return false;
  }
}

async function presentWidget(title, body) {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: WIDGET_ID, // same id => replaces in place
      content: {
        title,
        body,
        sticky: true, // ongoing: can't be swiped away
        autoDismiss: false,
        color: C.em,
        priority: Notifications.AndroidNotificationPriority.LOW,
        data: { kind: 'widget' },
      },
      trigger: { channelId: CH_WIDGET },
    });
  } catch {}
}

async function dismissWidget() {
  try {
    await Notifications.dismissNotificationAsync(WIDGET_ID);
  } catch {}
}

async function scheduleRestNotification(endAt) {
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_ID);
    const seconds = Math.max(1, Math.round((endAt - Date.now()) / 1000));
    await Notifications.scheduleNotificationAsync({
      identifier: REST_ID,
      content: { title: 'Rest complete', body: 'Time for your next set.', data: { kind: 'rest' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CH_REST },
    });
  } catch {}
}

async function cancelRestNotification() {
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_ID);
  } catch {}
}

/* ═══════════════════════════════ APP ═══════════════════════════════ */

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [tab, setTab] = useState('dashboard');
  const [openId, setOpenId] = useState(null); // exercise screen being viewed
  const [activeId, setActiveId] = useState(null); // exercise shown in pinned notification
  const [drafts, setDrafts] = useState({}); // { [exId]: { day, rows } }
  const [customize, setCustomize] = useState(null); // { exId, rowKey }
  const [customRestOpen, setCustomRestOpen] = useState(false);
  const [restEndAt, setRestEndAt] = useState(null);
  const [restTotal, setRestTotal] = useState(90);
  const [now, setNow] = useState(Date.now());
  const notifOk = useRef(false);
  const lastWidget = useRef(null);

  const today = dayKey(now);
  const deloadActive = !!settings.deloadUntil && now < settings.deloadUntil;

  /* ── load & persist ── */
  useEffect(() => {
    (async () => {
      try {
        const [l, s] = await Promise.all([AsyncStorage.getItem(KEYS.logs), AsyncStorage.getItem(KEYS.settings)]);
        const cutoff = Date.now() - 365 * DAY_MS;
        if (l) setLogs(JSON.parse(l).filter((x) => x.ts >= cutoff));
        if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
      } catch {}
      setReady(true);
      notifOk.current = await initNotifications();
    })();
  }, []);

  const commitLogs = useCallback((updater) => {
    setLogs((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      AsyncStorage.setItem(KEYS.logs, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const commitSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      AsyncStorage.setItem(KEYS.settings, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  /* ── clock tick (minute-level when idle) ── */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  /* ── engine ── */
  const plans = useMemo(() => {
    const out = {};
    for (const ex of EXERCISES) out[ex.id] = computePlan(ex, logs, settings, today, deloadActive);
    return out;
  }, [logs, settings, today, deloadActive]);

  const weekly = useMemo(() => {
    const since = Date.now() - 7 * DAY_MS;
    const counts = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
    const days = new Set();
    for (const l of logs) {
      if (l.ts < since) continue;
      days.add(l.day);
      if (l.setType !== 'warmup' && counts[l.muscle] !== undefined) counts[l.muscle] += 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { counts, total, sessions: days.size };
  }, [logs, today]);

  const doneToday = useMemo(() => new Set(logs.filter((l) => l.day === today).map((l) => l.exerciseId)), [logs, today]);

  const pickNext = useCallback(
    (currentId) => {
      const candidates = EXERCISES.filter((e) => e.id !== currentId && !doneToday.has(e.id));
      if (!candidates.length) return null;
      // Prioritise the muscle group with the lowest rolling weekly volume.
      return [...candidates].sort((a, b) => weekly.counts[a.muscle] - weekly.counts[b.muscle])[0];
    },
    [doneToday, weekly]
  );

  /* ── deload management ── */
  const startDeload = useCallback(() => {
    commitSettings({ deloadUntil: Date.now() + 7 * DAY_MS, plateauResetDay: dayKey() });
    setDrafts({}); // re-prefill with deload targets
  }, [commitSettings]);

  const endDeload = useCallback(() => {
    commitSettings({ deloadUntil: null, plateauResetDay: dayKey() });
    setDrafts({});
  }, [commitSettings]);

  const plateaued = useMemo(() => EXERCISES.filter((e) => plans[e.id].plateau), [plans]);

  useEffect(() => {
    if (!ready) return;
    if (settings.deloadUntil && Date.now() >= settings.deloadUntil) {
      commitSettings({ deloadUntil: null, plateauResetDay: dayKey() });
      setDrafts({});
      return;
    }
    if (!deloadActive && settings.autoDeload && plateaued.length) {
      startDeload();
      Alert.alert(
        'Plateau detected',
        `${plateaued.map((e) => e.name).join(', ')} missed target reps 2 sessions in a row.\n\nDeload week activated automatically: all loads −10% for 7 days.`
      );
    }
  }, [ready, plateaued, deloadActive, settings.autoDeload, settings.deloadUntil, startDeload, commitSettings]);

  /* ── rest timer ── */
  const startRest = useCallback((secs) => {
    const end = Date.now() + secs * 1000;
    setRestTotal(secs);
    setRestEndAt(end);
    setNow(Date.now());
    if (notifOk.current) scheduleRestNotification(end);
  }, []);

  const adjustRest = useCallback((delta) => {
    setRestEndAt((e) => {
      if (!e) return e;
      const next = Math.max(Date.now() + 1000, e + delta * 1000);
      if (notifOk.current) scheduleRestNotification(next);
      return next;
    });
    setRestTotal((t) => Math.max(1, t + delta));
  }, []);

  const stopRest = useCallback(() => {
    setRestEndAt(null);
    cancelRestNotification();
  }, []);

  useEffect(() => {
    if (!restEndAt) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= restEndAt) {
        clearInterval(t);
        setRestEndAt(null);
        if (n - restEndAt < 5000) {
          // Clock hit zero while app is open: subtle haptic buzz.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Vibration.vibrate([0, 120, 90, 120]);
        }
      }
    }, 250);
    return () => clearInterval(t);
  }, [restEndAt]);

  const restRemaining = restEndAt ? Math.max(0, Math.ceil((restEndAt - now) / 1000)) : 0;

  /* ── drafts / rows ── */
  const ensureDraft = useCallback(
    (exId) => {
      setDrafts((d) => {
        if (d[exId] && d[exId].day === today) return d;
        const todayLogs = logs.filter((l) => l.exerciseId === exId && l.day === today);
        return { ...d, [exId]: { day: today, rows: buildRows(plans[exId], todayLogs) } };
      });
    },
    [logs, plans, today]
  );

  const openExercise = useCallback(
    (exId) => {
      ensureDraft(exId);
      setOpenId(exId);
      setActiveId(exId);
      setTab('workout');
    },
    [ensureDraft]
  );

  useEffect(() => {
    if (openId) ensureDraft(openId); // rebuild after deload toggles / day rollover
  }, [openId, drafts, ensureDraft]);

  const updateRows = useCallback((exId, fn) => {
    setDrafts((d) => (d[exId] ? { ...d, [exId]: { ...d[exId], rows: fn(d[exId].rows) } } : d));
  }, []);

  const editRow = useCallback(
    (exId, key, field, value) => updateRows(exId, (rows) => rows.map((r) => (r.key === key ? { ...r, [field]: cleanNum(value) } : r))),
    [updateRows]
  );

  const toggleRow = useCallback(
    (exId, row) => {
      const ex = EX_BY_ID[exId];
      if (row.logId) {
        const id = row.logId;
        commitLogs((p) => p.filter((l) => l.id !== id));
        updateRows(exId, (rows) => rows.map((r) => (r.key === row.key ? { ...r, logId: null } : r)));
        Haptics.selectionAsync().catch(() => {});
        return;
      }
      const w = parseFloat(row.weight);
      const r = parseInt(row.reps, 10);
      if (Number.isNaN(w) || w < 0 || Number.isNaN(r) || r <= 0) {
        Alert.alert('Missing numbers', 'Enter a weight and rep count before logging.');
        return;
      }
      const log = {
        id: uid(),
        ts: Date.now(),
        day: dayKey(),
        exerciseId: ex.id,
        muscle: ex.muscle,
        setType: row.type,
        weight: w,
        reps: r,
        targetWeight: row.targetWeight,
        targetReps: row.targetReps,
        deload: deloadActive,
      };
      const isPR = row.type !== 'warmup' && plans[exId].pr > 0 && w > plans[exId].pr;
      commitLogs((p) => [...p, log]);
      updateRows(exId, (rows) =>
        rows.map((x) => (x.key === row.key ? { ...x, logId: log.id, weight: fmtW(w), reps: String(r) } : x))
      );
      Haptics.impactAsync(isPR ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      startRest(settings.restSeconds);
    },
    [commitLogs, updateRows, deloadActive, plans, startRest, settings.restSeconds]
  );

  const changeType = useCallback(
    (exId, rowKey, type) => {
      const loggedId = drafts[exId]?.rows.find((r) => r.key === rowKey)?.logId || null;
      if (loggedId) commitLogs((p) => p.map((l) => (l.id === loggedId ? { ...l, setType: type } : l)));
      updateRows(exId, (rows) => {
        const idx = rows.findIndex((r) => r.key === rowKey);
        if (idx < 0) return rows;
        const r = rows[idx];
        if (r.logId) return rows.map((x, i) => (i === idx ? { ...x, type } : x));
        let weight = r.targetWeight;
        if (type === 'drop') {
          const prevW = parseFloat(rows[idx - 1]?.weight ?? r.weight) || r.targetWeight;
          weight = round05(prevW * 0.8);
        } else if (type === 'warmup') {
          weight = round05(r.targetWeight * 0.5);
        }
        return rows.map((x, i) => (i === idx ? { ...x, type, weight: fmtW(weight) } : x));
      });
      Haptics.selectionAsync().catch(() => {});
      setCustomize(null);
    },
    [drafts, updateRows, commitLogs]
  );

  const removeRow = useCallback(
    (exId, rowKey) => {
      const row = drafts[exId]?.rows.find((r) => r.key === rowKey);
      if (row?.logId) commitLogs((p) => p.filter((l) => l.id !== row.logId));
      updateRows(exId, (rows) => rows.filter((r) => r.key !== rowKey));
      setCustomize(null);
    },
    [drafts, commitLogs, updateRows]
  );

  const addRow = useCallback(
    (exId) => {
      const plan = plans[exId];
      updateRows(exId, (rows) => {
        const lastStd = [...rows].reverse().find((r) => r.type === 'standard');
        const target = lastStd ? { weight: lastStd.targetWeight, reps: lastStd.targetReps } : plan.prefill;
        return [...rows, freshRow(target)];
      });
    },
    [plans, updateRows]
  );

  const acceptRecommendation = useCallback(
    (exId) => {
      const rec = plans[exId].rec;
      if (!rec) return;
      updateRows(exId, (rows) =>
        rows.map((r) =>
          r.logId || r.type !== 'standard'
            ? r
            : { ...r, weight: fmtW(rec.weight), reps: String(rec.reps), targetWeight: rec.weight, targetReps: rec.reps }
        )
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    [plans, updateRows]
  );

  const finishWorkout = useCallback(() => {
    setOpenId(null);
    setActiveId(null);
    stopRest();
    dismissWidget();
    lastWidget.current = null;
    setTab('dashboard');
  }, [stopRest]);

  /* ── pinned notification "widget" ── */
  const widgetText = useMemo(() => {
    if (!activeId || !drafts[activeId]) return null;
    const ex = EX_BY_ID[activeId];
    const rows = drafts[activeId].rows;
    const nextRow = rows.find((r) => !r.logId);
    const done = rows.filter((r) => r.logId).length;
    const nxt = pickNext(activeId);
    const title = nextRow
      ? `${ex.name} · ${nextRow.weight || '–'}kg × ${nextRow.reps || '–'}`
      : `${ex.name} · all sets complete`;
    const body = `Set ${Math.min(done + 1, rows.length)}/${rows.length}${deloadActive ? ' · DELOAD' : ''}  ·  Next: ${
      nxt ? nxt.name : 'Finish workout'
    }`;
    return { title, body };
  }, [activeId, drafts, pickNext, deloadActive]);

  useEffect(() => {
    if (!settings.widgetEnabled || !widgetText) {
      if (lastWidget.current) {
        dismissWidget();
        lastWidget.current = null;
      }
      return;
    }
    const sig = widgetText.title + '|' + widgetText.body;
    if (sig === lastWidget.current) return;
    const t = setTimeout(() => {
      if (!notifOk.current) return;
      lastWidget.current = sig;
      presentWidget(widgetText.title, widgetText.body);
    }, 500);
    return () => clearTimeout(t);
  }, [widgetText, settings.widgetEnabled]);

  /* ── render ── */
  if (!ready) return <View style={[s.root, { paddingTop: insets.top }]} />;

  const openEx = openId ? EX_BY_ID[openId] : null;
  const custRow = customize ? drafts[customize.exId]?.rows.find((r) => r.key === customize.rowKey) : null;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={{ flex: 1 }}>
        {tab === 'dashboard' && (
          <Dashboard
            weekly={weekly}
            deloadActive={deloadActive}
            deloadUntil={settings.deloadUntil}
            plateaued={plateaued}
            autoDeload={settings.autoDeload}
            onStartDeload={startDeload}
            onEndDeload={endDeload}
            onFocusMuscle={(m) => {
              const ex = EXERCISES.find((e) => e.muscle === m && !doneToday.has(e.id)) || EXERCISES.find((e) => e.muscle === m);
              openExercise(ex.id);
            }}
          />
        )}

        {tab === 'workout' && !openEx && (
          <ExerciseList
            plans={plans}
            doneToday={doneToday}
            weekly={weekly}
            upNext={pickNext(null)}
            activeId={activeId}
            deloadActive={deloadActive}
            onOpen={openExercise}
            onFinish={finishWorkout}
          />
        )}

        {tab === 'workout' && openEx && drafts[openId] && (
          <ExerciseScreen
            ex={openEx}
            plan={plans[openId]}
            rows={drafts[openId].rows}
            deloadActive={deloadActive}
            nextEx={pickNext(openId)}
            onBack={() => setOpenId(null)}
            onEdit={(key, field, v) => editRow(openId, key, field, v)}
            onToggle={(row) => toggleRow(openId, row)}
            onCustomize={(rowKey) => setCustomize({ exId: openId, rowKey })}
            onAccept={() => acceptRecommendation(openId)}
            onAddSet={() => addRow(openId)}
            onOpenNext={(id) => openExercise(id)}
            onFinish={finishWorkout}
            onTriggerDeload={startDeload}
            bottomPad={restEndAt ? 150 : 24}
          />
        )}

        {tab === 'settings' && (
          <SettingsScreen
            settings={settings}
            deloadActive={deloadActive}
            onPatch={commitSettings}
            onStartDeload={startDeload}
            onEndDeload={endDeload}
            onCustomRest={() => setCustomRestOpen(true)}
            onToggleWidget={async (v) => {
              if (v && !notifOk.current) notifOk.current = await initNotifications();
              if (v && !notifOk.current) {
                Alert.alert('Notifications blocked', 'Enable notifications for Overload in Android settings to use the pinned workout widget.');
                return;
              }
              commitSettings({ widgetEnabled: v });
            }}
            onReset={() =>
              Alert.alert('Reset all data?', 'This permanently deletes every logged set and setting.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete everything',
                  style: 'destructive',
                  onPress: () => {
                    commitLogs([]);
                    commitSettings(DEFAULT_SETTINGS);
                    setDrafts({});
                    finishWorkout();
                  },
                },
              ])
            }
          />
        )}
      </View>

      {restEndAt && (
        <RestBanner
          remaining={restRemaining}
          total={restTotal}
          current={settings.restSeconds}
          onAdjust={adjustRest}
          onSkip={stopRest}
          onPreset={(secs) => {
            commitSettings({ restSeconds: secs });
            startRest(secs);
          }}
          onCustom={() => setCustomRestOpen(true)}
        />
      )}

      <TabBar tab={tab} onTab={setTab} bottom={insets.bottom} hasActive={!!activeId} />

      <CustomizeModal
        row={custRow}
        onClose={() => setCustomize(null)}
        onPick={(type) => changeType(customize.exId, customize.rowKey, type)}
        onRemove={() => removeRow(customize.exId, customize.rowKey)}
      />

      <CustomRestModal
        visible={customRestOpen}
        initial={settings.restSeconds}
        onClose={() => setCustomRestOpen(false)}
        onSave={(secs) => {
          commitSettings({ restSeconds: secs });
          if (restEndAt) startRest(secs);
          setCustomRestOpen(false);
        }}
      />
    </View>
  );
}

/* ═══════════════════════════ DASHBOARD ═══════════════════════════ */

function Dashboard({ weekly, deloadActive, deloadUntil, plateaued, autoDeload, onStartDeload, onEndDeload, onFocusMuscle }) {
  const attention = MUSCLES.filter((m) => weekly.counts[m] < MIN_WEEKLY_SETS);
  const sorted = [...MUSCLES].sort((a, b) => weekly.counts[a] - weekly.counts[b]);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.eyebrow}>ROLLING 7 DAYS</Text>
      <Text style={s.h1}>Weekly Volume</Text>

      <View style={s.statRow}>
        <Stat label="Working sets" value={weekly.total} />
        <Stat label="Sessions" value={weekly.sessions} />
        <Stat label="Need attention" value={attention.length} hot={attention.length > 0} />
      </View>

      {deloadActive && (
        <View style={[s.card, s.cardHot]}>
          <Text style={s.cardTitleEm}>DELOAD WEEK ACTIVE</Text>
          <Text style={s.body}>
            All load recommendations are scaled back 10% until{' '}
            {new Date(deloadUntil).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}.
          </Text>
          <TouchableOpacity style={s.btnGhost} onPress={onEndDeload}>
            <Text style={s.btnGhostText}>End deload early</Text>
          </TouchableOpacity>
        </View>
      )}

      {!deloadActive && plateaued.length > 0 && !autoDeload && (
        <View style={[s.card, s.cardHot]}>
          <Text style={s.cardTitleEm}>PLATEAU DETECTED</Text>
          <Text style={s.body}>
            {plateaued.map((e) => e.name).join(', ')} missed target reps 2 sessions in a row.
          </Text>
          <TouchableOpacity style={s.btnEm} onPress={onStartDeload}>
            <Text style={s.btnEmText}>Trigger Deload Week</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.grid}>
        {sorted.map((m) => {
          const n = weekly.counts[m];
          const low = n < MIN_WEEKLY_SETS;
          return (
            <Pressable key={m} onPress={() => onFocusMuscle(m)} style={({ pressed }) => [s.muscleCard, low && s.muscleCardHot, pressed && { opacity: 0.7 }]}>
              <View style={s.rowBetween}>
                <Text style={s.muscleName}>{m}</Text>
                {!low && <Text style={s.okText}>✓</Text>}
              </View>
              <Text style={[s.muscleCount, low && { color: C.em }]}>
                {n}
                <Text style={s.muscleUnit}> sets</Text>
              </Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.min(100, (n / VISUAL_WEEKLY_TARGET) * 100)}%` }]} />
                <View style={[s.barMark, { left: `${(MIN_WEEKLY_SETS / VISUAL_WEEKLY_TARGET) * 100}%` }]} />
              </View>
              {low ? (
                <View style={s.attnBadge}>
                  <Text style={s.attnText}>⚠ ATTENTION NEEDED</Text>
                </View>
              ) : (
                <Text style={s.caption}>On track</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={[s.caption, { marginTop: 12 }]}>
        Warmups excluded. Groups under {MIN_WEEKLY_SETS} working sets are flagged. Tap a card to train it now.
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value, hot }) {
  return (
    <View style={[s.stat, hot && s.statHot]}>
      <Text style={[s.statValue, hot && { color: C.onEm }]}>{value}</Text>
      <Text style={[s.statLabel, hot && { color: C.onEm }]}>{label}</Text>
    </View>
  );
}

/* ═══════════════════════════ EXERCISE LIST ═══════════════════════════ */

function ExerciseList({ plans, doneToday, weekly, upNext, activeId, deloadActive, onOpen, onFinish }) {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.eyebrow}>{deloadActive ? 'DELOAD WEEK · −10%' : 'TODAY'}</Text>
      <Text style={s.h1}>Workout</Text>

      {upNext && (
        <Pressable onPress={() => onOpen(upNext.id)} style={[s.card, s.cardHot]}>
          <Text style={s.cardTitleEm}>UP NEXT · LOWEST VOLUME</Text>
          <Text style={s.h2}>{upNext.name}</Text>
          <Text style={s.body}>
            {upNext.muscle} · {weekly.counts[upNext.muscle]} sets this week · {plans[upNext.id].sets}×{plans[upNext.id].prefill.reps} @{' '}
            {fmtW(plans[upNext.id].prefill.weight)}kg
          </Text>
        </Pressable>
      )}

      {MUSCLES.map((m) => (
        <View key={m} style={{ marginTop: 18 }}>
          <Text style={s.sectionLabel}>{m.toUpperCase()}</Text>
          {EXERCISES.filter((e) => e.muscle === m).map((e) => {
            const p = plans[e.id];
            const done = doneToday.has(e.id);
            return (
              <Pressable key={e.id} onPress={() => onOpen(e.id)} style={({ pressed }) => [s.exRow, pressed && { opacity: 0.7 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.exName}>
                    {done ? '✓  ' : ''}
                    {e.name}
                  </Text>
                  <Text style={s.caption}>
                    {p.sets}×{p.prefill.reps} @ {fmtW(p.prefill.weight)}kg
                    {p.rec && !p.isDeloadRec ? '  ·  ↑ progression ready' : ''}
                  </Text>
                </View>
                {p.pr > 0 && <PRBadge pr={p.pr} />}
              </Pressable>
            );
          })}
        </View>
      ))}

      {activeId && (
        <TouchableOpacity style={[s.btnGhost, { marginTop: 24 }]} onPress={onFinish}>
          <Text style={s.btnGhostText}>Finish workout</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function PRBadge({ pr }) {
  return (
    <View style={s.prBadge}>
      <Text style={s.prText}>PR {fmtW(pr)}kg</Text>
    </View>
  );
}

/* ═══════════════════════════ EXERCISE SCREEN ═══════════════════════════ */

function ExerciseScreen({ ex, plan, rows, deloadActive, nextEx, onBack, onEdit, onToggle, onCustomize, onAccept, onAddSet, onOpenNext, onFinish, onTriggerDeload, bottomPad }) {
  let workingIdx = 0;
  const recApplied =
    plan.rec && rows.filter((r) => r.type === 'standard' && !r.logId).every((r) => r.targetWeight === plan.rec.weight && r.targetReps === plan.rec.reps);
  const allDone = rows.length > 0 && rows.every((r) => r.logId);

  return (
    <ScrollView contentContainerStyle={[s.page, { paddingBottom: bottomPad }]} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={onBack} hitSlop={12}>
        <Text style={s.back}>‹ All exercises</Text>
      </TouchableOpacity>

      <View style={[s.rowBetween, { marginTop: 8, alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={s.eyebrow}>{ex.muscle.toUpperCase()}</Text>
          <Text style={s.h1}>{ex.name}</Text>
          <Text style={s.caption}>
            {plan.last
              ? `Last: ${plan.last.setCount}×${plan.last.reps} @ ${fmtW(plan.last.weight)}kg · ${plan.last.met ? 'target met' : 'target missed'}`
              : 'First session — starting baseline'}
          </Text>
        </View>
        {plan.pr > 0 && <PRBadge pr={plan.pr} />}
      </View>

      {plan.plateau && !deloadActive && (
        <View style={[s.card, s.cardHot]}>
          <Text style={s.cardTitleEm}>PLATEAU · 2 SESSIONS MISSED</Text>
          <Text style={s.body}>Target reps were missed twice in a row. A recovery week resets fatigue.</Text>
          <TouchableOpacity style={s.btnEm} onPress={onTriggerDeload}>
            <Text style={s.btnEmText}>Trigger Deload Week</Text>
          </TouchableOpacity>
        </View>
      )}

      {plan.rec && (
        <View style={[s.card, s.recCard]}>
          <Text style={s.cardTitleEm}>{plan.isDeloadRec ? 'DELOAD TARGET' : 'RECOMMENDED NEXT STEP'}</Text>
          <Text style={s.recBig}>
            {plan.sets}×{plan.rec.reps} <Text style={{ color: C.sub }}>@</Text> {fmtW(plan.rec.weight)}kg
          </Text>
          <Text style={s.body}>{plan.rec.reason}</Text>
          <TouchableOpacity style={[s.btnEm, recApplied && s.btnEmDone]} onPress={onAccept} disabled={recApplied}>
            <Text style={[s.btnEmText, recApplied && { color: C.em }]}>{recApplied ? '✓ Applied to sets' : 'Accept Recommendation'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.gridHead}>
        <Text style={[s.th, { width: 40 }]}>SET</Text>
        <Text style={[s.th, { flex: 1 }]}>KG</Text>
        <Text style={[s.th, { flex: 1 }]}>REPS</Text>
        <Text style={[s.th, { width: 48, textAlign: 'center' }]}>LOG</Text>
        <Text style={[s.th, { width: 84, textAlign: 'center' }]}> </Text>
      </View>

      {rows.map((r) => {
        const meta = SET_TYPES[r.type];
        const label = meta.short || String(++workingIdx);
        const done = !!r.logId;
        return (
          <View key={r.key} style={[s.setRow, done && s.setRowDone]}>
            <View style={{ width: 40 }}>
              <Text style={[s.setLabel, r.type !== 'standard' && { color: C.em }]}>{label}</Text>
            </View>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <TextInput
                style={[s.input, done && s.inputDone]}
                value={r.weight}
                onChangeText={(v) => onEdit(r.key, 'weight', v)}
                keyboardType="decimal-pad"
                editable={!done}
                selectTextOnFocus
                placeholder={fmtW(r.targetWeight)}
                placeholderTextColor={C.dim}
              />
            </View>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <TextInput
                style={[s.input, done && s.inputDone]}
                value={r.reps}
                onChangeText={(v) => onEdit(r.key, 'reps', v.replace('.', ''))}
                keyboardType="number-pad"
                editable={!done}
                selectTextOnFocus
                placeholder={String(r.targetReps)}
                placeholderTextColor={C.dim}
              />
            </View>
            <TouchableOpacity style={[s.check, done && s.checkDone]} onPress={() => onToggle(r)} hitSlop={6}>
              <Text style={[s.checkText, done && { color: C.onEm }]}>✓</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.custBtn} onPress={() => onCustomize(r.key)}>
              <Text style={s.custText}>{r.type === 'standard' ? 'Customize' : meta.label}</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <TouchableOpacity style={[s.btnGhost, { marginTop: 10 }]} onPress={onAddSet}>
        <Text style={s.btnGhostText}>+ Add set</Text>
      </TouchableOpacity>

      {allDone && (
        <View style={{ marginTop: 18 }}>
          {nextEx ? (
            <TouchableOpacity style={s.btnEm} onPress={() => onOpenNext(nextEx.id)}>
              <Text style={s.btnEmText}>Next: {nextEx.name} ›</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.btnEm} onPress={onFinish}>
              <Text style={s.btnEmText}>Finish workout</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

/* ═══════════════════════════ SETTINGS ═══════════════════════════ */

function SettingsScreen({ settings, deloadActive, onPatch, onStartDeload, onEndDeload, onCustomRest, onToggleWidget, onReset }) {
  const isCustom = !REST_PRESETS.includes(settings.restSeconds);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.eyebrow}>PREFERENCES</Text>
      <Text style={s.h1}>Settings</Text>

      <Text style={[s.sectionLabel, { marginTop: 20 }]}>REST TIMER</Text>
      <View style={s.card}>
        <Text style={s.body}>Starts automatically the moment a set is logged.</Text>
        <View style={s.chipRow}>
          {REST_PRESETS.map((p) => (
            <Chip key={p} label={`${p}s`} active={settings.restSeconds === p} onPress={() => onPatch({ restSeconds: p })} />
          ))}
          <Chip label={isCustom ? fmtClock(settings.restSeconds) : 'Custom'} active={isCustom} onPress={onCustomRest} />
        </View>
      </View>

      <Text style={[s.sectionLabel, { marginTop: 20 }]}>DELOAD</Text>
      <View style={[s.card, deloadActive && s.cardHot]}>
        <Text style={s.h2}>{deloadActive ? 'Deload week active' : 'Training normally'}</Text>
        <Text style={s.body}>
          {deloadActive
            ? `Loads −10% until ${new Date(settings.deloadUntil).toLocaleDateString()}.`
            : 'A deload scales every weight recommendation back by 10% for 7 days.'}
        </Text>
        {deloadActive ? (
          <TouchableOpacity style={s.btnGhost} onPress={onEndDeload}>
            <Text style={s.btnGhostText}>End deload</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.btnEm} onPress={onStartDeload}>
            <Text style={s.btnEmText}>Trigger Deload Week</Text>
          </TouchableOpacity>
        )}
        <View style={[s.rowBetween, { marginTop: 16 }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.exName}>Auto-deload on plateau</Text>
            <Text style={s.caption}>Activates when any lift misses target reps 2 sessions in a row.</Text>
          </View>
          <Switch
            value={settings.autoDeload}
            onValueChange={(v) => onPatch({ autoDeload: v })}
            trackColor={{ false: C.border, true: C.emLine }}
            thumbColor={settings.autoDeload ? C.em : C.sub}
          />
        </View>
      </View>

      <Text style={[s.sectionLabel, { marginTop: 20 }]}>ANDROID</Text>
      <View style={s.card}>
        <View style={s.rowBetween}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.exName}>Pinned workout notification</Text>
            <Text style={s.caption}>Ongoing shade card with your current target weight and next exercise.</Text>
          </View>
          <Switch
            value={settings.widgetEnabled}
            onValueChange={onToggleWidget}
            trackColor={{ false: C.border, true: C.emLine }}
            thumbColor={settings.widgetEnabled ? C.em : C.sub}
          />
        </View>
      </View>

      <TouchableOpacity style={[s.btnGhost, { marginTop: 28 }]} onPress={onReset}>
        <Text style={[s.btnGhostText, { color: C.sub }]}>Reset all data</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && { color: C.onEm }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ═══════════════════════════ OVERLAYS ═══════════════════════════ */

function RestBanner({ remaining, total, current, onAdjust, onSkip, onPreset, onCustom }) {
  const pct = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
  return (
    <View style={s.restWrap}>
      <View style={s.restTrack}>
        <View style={[s.restFill, { width: `${pct}%` }]} />
      </View>
      <View style={s.restBody}>
        <View>
          <Text style={s.restLabel}>REST</Text>
          <Text style={s.restClock}>{fmtClock(remaining)}</Text>
        </View>
        <View style={s.restActions}>
          <TouchableOpacity style={s.restBtn} onPress={() => onAdjust(-15)}>
            <Text style={s.restBtnText}>−15</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.restBtn} onPress={() => onAdjust(15)}>
            <Text style={s.restBtnText}>+15</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.restBtn, { backgroundColor: C.em, borderColor: C.em }]} onPress={onSkip}>
            <Text style={[s.restBtnText, { color: C.onEm }]}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={[s.chipRow, { marginTop: 0, paddingHorizontal: 16, paddingBottom: 12 }]}>
        {REST_PRESETS.map((p) => (
          <Chip key={p} label={`${p}s`} active={current === p} onPress={() => onPreset(p)} />
        ))}
        <Chip label="Custom" active={!REST_PRESETS.includes(current)} onPress={onCustom} />
      </View>
    </View>
  );
}

function CustomizeModal({ row, onClose, onPick, onRemove }) {
  return (
    <Modal visible={!!row} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.eyebrow}>CUSTOMIZE SET</Text>
          {row &&
            Object.entries(SET_TYPES).map(([key, meta]) => {
              const active = row.type === key;
              return (
                <TouchableOpacity key={key} style={[s.option, active && s.optionActive]} onPress={() => onPick(key)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.exName, active && { color: C.em }]}>{meta.label}</Text>
                    <Text style={s.caption}>{meta.desc}</Text>
                  </View>
                  {active && <Text style={{ color: C.em, fontSize: 18 }}>●</Text>}
                </TouchableOpacity>
              );
            })}
          <TouchableOpacity style={[s.btnGhost, { marginTop: 12 }]} onPress={onRemove}>
            <Text style={[s.btnGhostText, { color: C.sub }]}>Remove set</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CustomRestModal({ visible, initial, onClose, onSave }) {
  const [secs, setSecs] = useState(initial);
  useEffect(() => {
    if (visible) setSecs(initial);
  }, [visible, initial]);
  const step = (d) => setSecs((v) => Math.min(600, Math.max(15, v + d)));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.eyebrow}>CUSTOM REST DURATION</Text>
          <View style={s.stepper}>
            <TouchableOpacity style={s.stepBtn} onPress={() => step(-15)}>
              <Text style={s.stepText}>−</Text>
            </TouchableOpacity>
            <Text style={s.stepValue}>{fmtClock(secs)}</Text>
            <TouchableOpacity style={s.stepBtn} onPress={() => step(15)}>
              <Text style={s.stepText}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={s.chipRow}>
            {[45, 150, 180, 240, 300].map((p) => (
              <Chip key={p} label={fmtClock(p)} active={secs === p} onPress={() => setSecs(p)} />
            ))}
          </View>
          <TouchableOpacity style={[s.btnEm, { marginTop: 16 }]} onPress={() => onSave(secs)}>
            <Text style={s.btnEmText}>Save</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TabBar({ tab, onTab, bottom, hasActive }) {
  const tabs = [
    ['dashboard', 'Dashboard'],
    ['workout', hasActive ? 'Workout •' : 'Workout'],
    ['settings', 'Settings'],
  ];
  return (
    <View style={[s.tabBar, { paddingBottom: Math.max(bottom, 10) }]}>
      {tabs.map(([key, label]) => {
        const active = tab === key;
        return (
          <TouchableOpacity key={key} style={s.tab} onPress={() => onTab(key)}>
            <View style={[s.tabPip, active && { backgroundColor: C.em }]} />
            <Text style={[s.tabText, active && { color: C.text }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ═══════════════════════════════ STYLES ═══════════════════════════════ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  page: { padding: 20, paddingBottom: 40 },
  eyebrow: { color: C.em, fontSize: 11, fontWeight: '700', letterSpacing: 1.6, marginBottom: 6 },
  h1: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  h2: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  body: { color: C.sub, fontSize: 14, lineHeight: 20 },
  caption: { color: C.dim, fontSize: 12, marginTop: 2 },
  sectionLabel: { color: C.dim, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  card: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, marginTop: 14 },
  cardHot: { borderColor: C.emLine, backgroundColor: C.emSoft },
  cardTitleEm: { color: C.em, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 6 },
  recCard: { borderColor: C.em, borderWidth: 1.5 },
  recBig: { color: C.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },

  statRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stat: { flex: 1, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12 },
  statHot: { backgroundColor: C.em, borderColor: C.em },
  statValue: { color: C.text, fontSize: 24, fontWeight: '800' },
  statLabel: { color: C.dim, fontSize: 11, fontWeight: '600', marginTop: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 14 },
  muscleCard: { width: '48.5%', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  muscleCardHot: { borderColor: C.em, borderWidth: 1.5 },
  muscleName: { color: C.text, fontSize: 14, fontWeight: '700' },
  muscleCount: { color: C.text, fontSize: 28, fontWeight: '800', marginTop: 6 },
  muscleUnit: { fontSize: 13, color: C.dim, fontWeight: '600' },
  okText: { color: C.em, fontSize: 14, fontWeight: '800' },
  barTrack: { height: 4, backgroundColor: C.surface2, borderRadius: 2, marginTop: 8, marginBottom: 10, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: C.em, borderRadius: 2 },
  barMark: { position: 'absolute', top: 0, width: 2, height: 4, backgroundColor: C.sub },
  attnBadge: { alignSelf: 'flex-start', backgroundColor: C.em, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  attnText: { color: C.onEm, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 },

  exRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8 },
  exName: { color: C.text, fontSize: 15, fontWeight: '600' },
  prBadge: { borderWidth: 1, borderColor: C.em, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  prText: { color: C.em, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  back: { color: C.em, fontSize: 15, fontWeight: '600' },

  gridHead: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 6, paddingHorizontal: 10 },
  th: { color: C.dim, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  setRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6 },
  setRowDone: { backgroundColor: C.emSoft, borderColor: C.emLine },
  setLabel: { color: C.text, fontSize: 16, fontWeight: '800' },
  input: { backgroundColor: C.surface2, color: C.text, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  inputDone: { backgroundColor: 'transparent', color: C.em },
  check: { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
  checkDone: { backgroundColor: C.em, borderColor: C.em },
  checkText: { color: C.dim, fontSize: 18, fontWeight: '900' },
  custBtn: { width: 80, paddingVertical: 9, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', marginLeft: 4 },
  custText: { color: C.sub, fontSize: 11, fontWeight: '700' },

  btnEm: { backgroundColor: C.em, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnEmDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.emLine },
  btnEmText: { color: C.onEm, fontSize: 15, fontWeight: '800' },
  btnGhost: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginTop: 12 },
  btnGhostText: { color: C.em, fontSize: 14, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.surface2 },
  chipActive: { backgroundColor: C.em, borderColor: C.em },
  chipText: { color: C.sub, fontSize: 13, fontWeight: '700' },

  restWrap: { backgroundColor: C.surface, borderTopWidth: 1, borderColor: C.emLine },
  restTrack: { height: 3, backgroundColor: C.surface2 },
  restFill: { height: 3, backgroundColor: C.em },
  restBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  restLabel: { color: C.em, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  restClock: { color: C.text, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  restActions: { flexDirection: 'row', gap: 8 },
  restBtn: { borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.surface2 },
  restBtnText: { color: C.text, fontSize: 14, fontWeight: '800' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderColor: C.border },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 8 },
  optionActive: { borderColor: C.em, backgroundColor: C.emSoft },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  stepBtn: { width: 56, height: 56, borderRadius: 14, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  stepText: { color: C.em, fontSize: 26, fontWeight: '800' },
  stepValue: { color: C.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },

  tabBar: { flexDirection: 'row', backgroundColor: C.bg, borderTopWidth: 1, borderColor: C.border, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabPip: { width: 18, height: 3, borderRadius: 2, backgroundColor: 'transparent', marginBottom: 6 },
  tabText: { color: C.dim, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
});
