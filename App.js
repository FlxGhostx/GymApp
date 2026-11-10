import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import {
  Activity,
  Check,
  Dumbbell,
  Flame,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  SkipForward,
  SlidersHorizontal,
  Timer,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Trophy,
  X,
} from 'lucide-react-native';

/* ------------------------------------------------------------------ */
/* Theme & constants                                                   */
/* ------------------------------------------------------------------ */

const C = {
  bg: '#000000',
  card: '#121214',
  card2: '#1a1a1d',
  border: '#26262b',
  text: '#f4f4f5',
  muted: '#8b8b94',
  accent: '#10b981',
  accentDim: 'rgba(16,185,129,0.14)',
  warn: '#facc15',
  danger: '#ef4444',
  dangerDim: 'rgba(239,68,68,0.14)',
};

const STORAGE_KEY = 'overload:v1';
const DAY = 24 * 60 * 60 * 1000;
const MIN_WEEKLY_SETS = 4;
const DELOAD_FACTOR = 0.9;

const MUSCLES = ['Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps', 'Core'];

const SET_TYPES = {
  standard: { label: 'Standard', short: 'S', color: C.text },
  drop: { label: 'Drop Set', short: 'D', color: '#60a5fa' },
  warmup: { label: 'Warmup', short: 'W', color: C.warn },
  failure: { label: 'To Failure', short: 'F', color: C.danger },
};

const DEFAULT_EXERCISES = [
  { id: 'bench', name: 'Barbell Bench Press', muscle: 'Chest', startWeight: 60, repMin: 6, repMax: 10, increment: 2.5, sets: 3 },
  { id: 'incline-db', name: 'Incline Dumbbell Press', muscle: 'Chest', startWeight: 22.5, repMin: 8, repMax: 12, increment: 2.5, sets: 3 },
  { id: 'pullup', name: 'Weighted Pull-Up', muscle: 'Back', startWeight: 0, repMin: 6, repMax: 10, increment: 2.5, sets: 3 },
  { id: 'row', name: 'Barbell Row', muscle: 'Back', startWeight: 60, repMin: 8, repMax: 12, increment: 2.5, sets: 3 },
  { id: 'squat', name: 'Back Squat', muscle: 'Quads', startWeight: 80, repMin: 5, repMax: 8, increment: 5, sets: 3 },
  { id: 'legpress', name: 'Leg Press', muscle: 'Quads', startWeight: 120, repMin: 10, repMax: 15, increment: 10, sets: 3 },
  { id: 'rdl', name: 'Romanian Deadlift', muscle: 'Hamstrings', startWeight: 70, repMin: 6, repMax: 10, increment: 5, sets: 3 },
  { id: 'legcurl', name: 'Seated Leg Curl', muscle: 'Hamstrings', startWeight: 40, repMin: 10, repMax: 15, increment: 2.5, sets: 3 },
  { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', startWeight: 40, repMin: 6, repMax: 10, increment: 2.5, sets: 3 },
  { id: 'lateral', name: 'Lateral Raise', muscle: 'Shoulders', startWeight: 10, repMin: 12, repMax: 20, increment: 1, sets: 3 },
  { id: 'bbcurl', name: 'Barbell Curl', muscle: 'Biceps', startWeight: 30, repMin: 8, repMax: 12, increment: 2.5, sets: 3 },
  { id: 'hammer', name: 'Hammer Curl', muscle: 'Biceps', startWeight: 14, repMin: 10, repMax: 15, increment: 2, sets: 3 },
  { id: 'pushdown', name: 'Cable Triceps Pushdown', muscle: 'Triceps', startWeight: 25, repMin: 10, repMax: 15, increment: 2.5, sets: 3 },
  { id: 'skull', name: 'EZ-Bar Skull Crusher', muscle: 'Triceps', startWeight: 25, repMin: 8, repMax: 12, increment: 2.5, sets: 3 },
  { id: 'cablecrunch', name: 'Cable Crunch', muscle: 'Core', startWeight: 30, repMin: 10, repMax: 15, increment: 5, sets: 3 },
  { id: 'legraise', name: 'Hanging Leg Raise', muscle: 'Core', startWeight: 0, repMin: 8, repMax: 15, increment: 2.5, sets: 3 },
];

const DEFAULT_DATA = {
  history: [], // [{ id, date, exerciseId, isDeload, hit, sets:[{type, weight, reps, targetWeight, targetReps}] }]
  workout: null, // { startedAt, entries:[{ key, exerciseId, accepted, sets:[...] }] }
  settings: {
    manualDeload: false,
    restSeconds: 90,
    unit: 'kg',
    customExercises: [],
  },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const roundTo = (x, step) => {
  const s = step > 0 ? step : 0.5;
  return Math.max(0, Math.round(x / s) * s);
};
const fmtW = (w) => (Math.round(w * 100) / 100).toString();
const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.max(0, s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};
const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function confirmAction(title, message, onYes) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'OK', style: 'destructive', onPress: onYes },
  ]);
}

function makeSet(type, weight, reps) {
  return {
    id: uid(),
    type,
    weight: fmtW(weight),
    reps: String(reps),
    targetWeight: weight,
    targetReps: reps,
    done: false,
  };
}

/* ---------- Audio / vibration cues (Web Audio API + Vibration API) ---------- */

let audioCtx = null;
function primeAudio() {
  // Must be called from a user gesture so browsers allow audio later.
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {
    /* ignore */
  }
}
function playAlarm() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500]);
  } catch (e) {
    /* ignore */
  }
  try {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((offset, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.22);
    });
  } catch (e) {
    /* ignore */
  }
}

/* ---------- Training logic ---------- */

/** A logged session "hit" if every planned standard set (and any done to-failure set) met its targets. */
function evaluateHit(sets) {
  const evaluated = sets.filter((s) => s.type === 'standard' || (s.type === 'failure' && s.done));
  if (evaluated.length === 0) return false;
  return evaluated.every(
    (s) => s.done && num(s.reps) >= num(s.targetReps) && num(s.weight) >= num(s.targetWeight) - 1e-9
  );
}

function getPR(history, exerciseId) {
  let best = null;
  history.forEach((log) => {
    if (log.exerciseId !== exerciseId) return;
    log.sets.forEach((s) => {
      if (s.type === 'warmup') return;
      if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) {
        best = { weight: s.weight, reps: s.reps, date: log.date };
      }
    });
  });
  return best;
}

/**
 * Builds the training prescription for an exercise:
 * - base targets (weight/reps/sets) from the last non-deload session
 * - progression recommendation (double progression: add reps up to repMax, then add weight)
 * - deload status (manual toggle OR auto after 2 consecutive failed sessions)
 */
function analyzeExercise(ex, history, settings) {
  const logs = history.filter((l) => l.exerciseId === ex.id).sort((a, b) => b.date - a.date);

  // Consecutive failures, newest first. A completed deload session resets the streak.
  let failStreak = 0;
  for (const log of logs) {
    if (log.isDeload) break;
    if (!log.hit) failStreak += 1;
    else break;
  }
  const autoDeload = failStreak >= 2;
  const manualDeload = !!settings.manualDeload;
  const deload = manualDeload || autoDeload;

  const baseLog = logs.find((l) => !l.isDeload) || null;
  let base;
  if (!baseLog) {
    base = { weight: ex.startWeight, reps: ex.repMin, sets: ex.sets || 3 };
  } else {
    const working = baseLog.sets.filter((s) => s.type === 'standard' || s.type === 'failure');
    const pool = working.length ? working : baseLog.sets.filter((s) => s.type !== 'warmup');
    const weight = pool.length ? Math.max(...pool.map((s) => s.targetWeight ?? s.weight)) : ex.startWeight;
    const reps = pool.length ? Math.max(...pool.map((s) => s.targetReps ?? s.reps)) : ex.repMin;
    const sets = baseLog.sets.filter((s) => s.type === 'standard').length || ex.sets || 3;
    base = { weight, reps, sets };
  }

  let rec = null;
  if (deload) {
    rec = {
      kind: 'deload',
      weight: roundTo(base.weight * DELOAD_FACTOR, ex.increment),
      reps: base.reps,
      title: manualDeload ? 'Deload week active' : 'Auto-deload triggered',
      detail: manualDeload
        ? `Weights scaled back 10% from ${fmtW(base.weight)}.`
        : `Targets missed ${failStreak} sessions in a row. Weights scaled back 10% from ${fmtW(base.weight)}.`,
    };
  } else if (baseLog && baseLog.hit) {
    if (base.reps < ex.repMax) {
      rec = {
        kind: 'progress',
        weight: base.weight,
        reps: base.reps + 1,
        title: 'Recommended Next Step',
        detail: `You hit ${base.reps} reps last time. Add a rep: ${fmtW(base.weight)} × ${base.reps + 1}.`,
      };
    } else {
      const w = roundTo(base.weight + ex.increment, ex.increment);
      rec = {
        kind: 'progress',
        weight: w,
        reps: ex.repMin,
        title: 'Recommended Next Step',
        detail: `Top of rep range reached. Increase weight: ${fmtW(w)} × ${ex.repMin}.`,
      };
    }
  } else if (baseLog && !baseLog.hit) {
    rec = {
      kind: 'hold',
      weight: base.weight,
      reps: base.reps,
      title: 'Hold targets',
      detail:
        failStreak === 1
          ? 'Targets were missed last session. Repeat them — one more miss triggers an auto-deload.'
          : 'Repeat last session’s targets.',
    };
  }

  const prefillWeight = deload ? rec.weight : base.weight;
  return {
    logs,
    base,
    rec,
    deload,
    autoDeload,
    manualDeload,
    failStreak,
    prefillWeight,
    pr: getPR(history, ex.id),
  };
}

function computeWeeklyVolume(history, workout, exerciseMap) {
  const cutoff = Date.now() - 7 * DAY;
  const counts = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
  history.forEach((log) => {
    if (log.date < cutoff) return;
    const ex = exerciseMap[log.exerciseId];
    if (!ex || counts[ex.muscle] === undefined) return;
    counts[ex.muscle] += log.sets.filter((s) => s.type !== 'warmup').length;
  });
  if (workout) {
    workout.entries.forEach((entry) => {
      const ex = exerciseMap[entry.exerciseId];
      if (!ex || counts[ex.muscle] === undefined) return;
      counts[ex.muscle] += entry.sets.filter((s) => s.done && s.type !== 'warmup').length;
    });
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/* Small UI primitives                                                 */
/* ------------------------------------------------------------------ */

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Btn({ label, onPress, icon: Icon, variant = 'primary', small, style, disabled }) {
  const v = {
    primary: { bg: C.accent, fg: '#000', border: C.accent },
    ghost: { bg: 'transparent', fg: C.text, border: C.border },
    accentGhost: { bg: C.accentDim, fg: C.accent, border: C.accent },
    danger: { bg: C.dangerDim, fg: C.danger, border: C.danger },
  }[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.4 : 1 },
        style,
      ]}
    >
      {Icon ? <Icon size={small ? 14 : 16} color={v.fg} style={{ marginRight: label ? 6 : 0 }} /> : null}
      {label ? <Text style={[styles.btnText, small && { fontSize: 13 }, { color: v.fg }]}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, active && { backgroundColor: C.accent, borderColor: C.accent }]}
    >
      <Text style={[styles.chipText, active && { color: '#000' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SheetModal({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.h2}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={20} color={C.muted} />
            </TouchableOpacity>
          </View>
          <View style={{ marginTop: 12, flexShrink: 1 }}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Rest timer                                                          */
/* ------------------------------------------------------------------ */

function RestTimerBar({ timer, restSeconds, onPreset, onCustom, onSkip, onAdd }) {
  const [now, setNow] = useState(Date.now());
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState(String(restSeconds));

  useEffect(() => {
    if (!timer) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer]);

  const remaining = timer ? Math.max(0, Math.ceil((timer.endAt - now) / 1000)) : 0;
  const pct = timer ? Math.min(1, Math.max(0, 1 - remaining / timer.duration)) : 0;
  const isPreset = [60, 90, 120].includes(restSeconds);

  return (
    <View style={styles.timerBar}>
      {timer ? (
        <View style={styles.timerProgressTrack}>
          <View style={[styles.timerProgressFill, { width: `${pct * 100}%` }]} />
        </View>
      ) : null}
      <View style={styles.rowBetween}>
        <View style={styles.row}>
          <Timer size={18} color={timer ? C.accent : C.muted} />
          <Text style={[styles.timerText, { color: timer ? C.accent : C.muted }]}>
            {timer ? fmtTime(remaining) : `Rest ${fmtTime(restSeconds)}`}
          </Text>
        </View>
        {timer ? (
          <View style={styles.row}>
            <Btn small variant="ghost" label="+15s" onPress={onAdd} />
            <Btn small variant="accentGhost" icon={SkipForward} label="Skip" onPress={onSkip} style={{ marginLeft: 6 }} />
          </View>
        ) : (
          <Text style={styles.mutedSmall}>Auto-starts when a set is checked</Text>
        )}
      </View>
      <View style={[styles.row, { marginTop: 8, flexWrap: 'wrap' }]}>
        {[60, 90, 120].map((s) => (
          <Chip key={s} label={`${s}s`} active={restSeconds === s} onPress={() => onPreset(s)} />
        ))}
        <Chip
          label={!isPreset ? `Custom ${restSeconds}s` : 'Custom'}
          active={!isPreset}
          onPress={() => {
            setCustomVal(String(restSeconds));
            setCustomOpen(true);
          }}
        />
      </View>

      <SheetModal visible={customOpen} onClose={() => setCustomOpen(false)} title="Custom rest time">
        <Text style={styles.label}>Seconds</Text>
        <TextInput
          value={customVal}
          onChangeText={setCustomVal}
          keyboardType="number-pad"
          style={styles.input}
          placeholder="e.g. 150"
          placeholderTextColor={C.muted}
        />
        <Btn
          label="Save"
          style={{ marginTop: 12 }}
          onPress={() => {
            const v = Math.round(num(customVal));
            if (v >= 5 && v <= 1800) onCustom(v);
            setCustomOpen(false);
          }}
        />
      </SheetModal>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Workout logger                                                      */
/* ------------------------------------------------------------------ */

function SetRow({ set, index, unit, pr, onChange, onToggleDone, onCustomize }) {
  const t = SET_TYPES[set.type];
  const isNewPR = set.done && set.type !== 'warmup' && num(set.weight) > 0 && (!pr || num(set.weight) > pr.weight);
  return (
    <View style={[styles.setRow, set.done && { backgroundColor: C.accentDim, borderColor: 'rgba(16,185,129,0.35)' }]}>
      <View style={[styles.setBadge, { borderColor: t.color }]}>
        <Text style={[styles.setBadgeText, { color: t.color }]}>{set.type === 'standard' ? index : t.short}</Text>
      </View>
      <View style={styles.setInputs}>
        <View style={styles.setField}>
          <TextInput
            value={set.weight}
            onChangeText={(v) => onChange({ weight: v })}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={styles.setInput}
          />
          <Text style={styles.setUnit}>{unit}</Text>
        </View>
        <Text style={styles.times}>×</Text>
        <View style={styles.setField}>
          <TextInput
            value={set.reps}
            onChangeText={(v) => onChange({ reps: v })}
            keyboardType="number-pad"
            selectTextOnFocus
            style={styles.setInput}
          />
          <Text style={styles.setUnit}>reps</Text>
        </View>
      </View>
      {isNewPR ? (
        <View style={styles.prMini}>
          <Trophy size={11} color="#000" />
          <Text style={styles.prMiniText}>PR</Text>
        </View>
      ) : null}
      <TouchableOpacity onPress={onCustomize} style={styles.iconBtn} hitSlop={6} accessibilityLabel="Customize set">
        <SlidersHorizontal size={17} color={C.muted} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onToggleDone}
        style={[styles.doneBtn, set.done && { backgroundColor: C.accent, borderColor: C.accent }]}
        accessibilityLabel="Complete set"
      >
        <Check size={18} color={set.done ? '#000' : C.muted} strokeWidth={3} />
      </TouchableOpacity>
    </View>
  );
}

function ExerciseCard({ entry, ex, analysis, unit, onUpdateEntry, onRemove, onSetDone, onCustomizeSet }) {
  const { rec, pr, deload } = analysis;
  let standardIndex = 0;

  const updateSet = (setId, patch) =>
    onUpdateEntry((e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));

  const acceptRec = () =>
    onUpdateEntry((e) => ({
      ...e,
      accepted: true,
      sets: e.sets.map((s) =>
        !s.done && (s.type === 'standard' || s.type === 'failure')
          ? { ...s, weight: fmtW(rec.weight), reps: String(rec.reps), targetWeight: rec.weight, targetReps: rec.reps }
          : s
      ),
    }));

  const addSet = (type) =>
    onUpdateEntry((e) => {
      if (type === 'warmup') {
        const w = roundTo(analysis.prefillWeight * 0.5, ex.increment);
        return { ...e, sets: [makeSet('warmup', w, 10), ...e.sets] };
      }
      const lastWorking = [...e.sets].reverse().find((s) => s.type !== 'warmup');
      const w = lastWorking ? num(lastWorking.targetWeight) : analysis.prefillWeight;
      const r = lastWorking ? num(lastWorking.targetReps) : analysis.base.reps;
      return { ...e, sets: [...e.sets, makeSet('standard', w, r)] };
    });

  const recColor = rec?.kind === 'deload' ? C.warn : rec?.kind === 'hold' ? C.muted : C.accent;

  return (
    <Card>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.h2}>{ex.name}</Text>
          <View style={[styles.row, { marginTop: 4, flexWrap: 'wrap' }]}>
            <Text style={styles.tag}>{ex.muscle}</Text>
            <Text style={styles.tag}>
              {ex.repMin}–{ex.repMax} reps
            </Text>
            {deload ? <Text style={[styles.tag, { color: C.warn, borderColor: C.warn }]}>DELOAD</Text> : null}
          </View>
        </View>
        <View style={styles.prBadge}>
          <Trophy size={14} color={C.accent} />
          <Text style={styles.prText}>{pr ? `${fmtW(pr.weight)}${unit} × ${pr.reps}` : 'No PR'}</Text>
        </View>
      </View>

      {rec ? (
        <View style={[styles.recBanner, { borderColor: recColor }]}>
          <View style={[styles.row, { alignItems: 'flex-start' }]}>
            {rec.kind === 'deload' ? (
              <TriangleAlert size={18} color={recColor} />
            ) : (
              <TrendingUp size={18} color={recColor} />
            )}
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.recTitle, { color: recColor }]}>{rec.title}</Text>
              <Text style={styles.recDetail}>{rec.detail}</Text>
            </View>
          </View>
          {rec.kind === 'progress' ? (
            entry.accepted ? (
              <View style={[styles.row, { marginTop: 8 }]}>
                <Check size={14} color={C.accent} />
                <Text style={[styles.mutedSmall, { color: C.accent, marginLeft: 4 }]}>Recommendation applied</Text>
              </View>
            ) : (
              <Btn small label="Accept Recommendation" icon={Check} onPress={acceptRec} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
            )
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: 10 }}>
        {entry.sets.map((s) => {
          if (s.type === 'standard') standardIndex += 1;
          return (
            <SetRow
              key={s.id}
              set={s}
              index={standardIndex}
              unit={unit}
              pr={pr}
              onChange={(patch) => updateSet(s.id, patch)}
              onToggleDone={() => onSetDone(s.id, !s.done)}
              onCustomize={() => onCustomizeSet(s.id)}
            />
          );
        })}
      </View>

      <View style={[styles.row, { marginTop: 8, flexWrap: 'wrap' }]}>
        <Btn small variant="ghost" icon={Plus} label="Set" onPress={() => addSet('standard')} style={{ marginRight: 6 }} />
        <Btn small variant="ghost" icon={Flame} label="Warmup" onPress={() => addSet('warmup')} style={{ marginRight: 6 }} />
        <View style={{ flex: 1 }} />
        <Btn small variant="danger" icon={Trash2} onPress={onRemove} />
      </View>
    </Card>
  );
}

function WorkoutScreen({ data, setData, exercises, exerciseMap, unit, startRest }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customize, setCustomize] = useState(null); // { entryKey, setId }
  const workout = data.workout;

  const analyses = useMemo(() => {
    const out = {};
    exercises.forEach((ex) => {
      out[ex.id] = analyzeExercise(ex, data.history, data.settings);
    });
    return out;
  }, [exercises, data.history, data.settings]);

  const setWorkout = (fn) => setData((d) => ({ ...d, workout: fn(d.workout) }));

  const addExercise = (ex) => {
    const a = analyses[ex.id];
    const sets = Array.from({ length: a.base.sets }, () => makeSet('standard', a.prefillWeight, a.base.reps));
    setWorkout((w) => {
      const base = w || { startedAt: Date.now(), entries: [] };
      return { ...base, entries: [...base.entries, { key: uid(), exerciseId: ex.id, accepted: false, sets }] };
    });
    setPickerOpen(false);
  };

  const updateEntry = (key, fn) =>
    setWorkout((w) => ({ ...w, entries: w.entries.map((e) => (e.key === key ? fn(e) : e)) }));

  const removeEntry = (key) =>
    setWorkout((w) => {
      const entries = w.entries.filter((e) => e.key !== key);
      return entries.length ? { ...w, entries } : null;
    });

  const onSetDone = (key, setId, done) => {
    if (done) primeAudio();
    updateEntry(key, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, done } : s)) }));
    if (done) startRest();
  };

  const finishWorkout = () => {
    const now = Date.now();
    const logs = [];
    workout.entries.forEach((entry, i) => {
      const ex = exerciseMap[entry.exerciseId];
      const doneSets = entry.sets.filter((s) => s.done);
      if (!ex || doneSets.length === 0) return;
      logs.push({
        id: uid(),
        date: now + i, // keep ordering stable if the same exercise appears twice
        exerciseId: entry.exerciseId,
        isDeload: analyses[entry.exerciseId]?.deload || false,
        hit: evaluateHit(entry.sets),
        sets: doneSets.map((s) => ({
          type: s.type,
          weight: num(s.weight),
          reps: Math.round(num(s.reps)),
          targetWeight: num(s.targetWeight),
          targetReps: num(s.targetReps),
        })),
      });
    });
    setData((d) => ({ ...d, history: [...d.history, ...logs], workout: null }));
  };

  const customizeEntry = customize && workout?.entries.find((e) => e.key === customize.entryKey);
  const customizeSet = customizeEntry?.sets.find((s) => s.id === customize.setId);

  const grouped = useMemo(
    () => MUSCLES.map((m) => ({ muscle: m, items: exercises.filter((e) => e.muscle === m) })),
    [exercises]
  );

  const doneCount = workout ? workout.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0) : 0;

  return (
    <View>
      {data.settings.manualDeload ? (
        <View style={styles.deloadStrip}>
          <TriangleAlert size={16} color="#000" />
          <Text style={styles.deloadStripText}>DELOAD WEEK — all targets at 90%</Text>
        </View>
      ) : null}

      {!workout ? (
        <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
          <Dumbbell size={40} color={C.accent} />
          <Text style={[styles.h1, { marginTop: 12 }]}>Ready to train</Text>
          <Text style={[styles.muted, { textAlign: 'center', marginTop: 6, marginBottom: 16 }]}>
            Pick an exercise. Sets are pre-filled with your progressive overload targets.
          </Text>
          <Btn label="Add Exercise" icon={Plus} onPress={() => setPickerOpen(true)} />
        </Card>
      ) : (
        <>
          <View style={[styles.rowBetween, { marginBottom: 10 }]}>
            <View>
              <Text style={styles.h1}>Today’s Session</Text>
              <Text style={styles.mutedSmall}>
                Started {new Date(workout.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
                {doneCount} sets done
              </Text>
            </View>
          </View>
          {workout.entries.map((entry) => {
            const ex = exerciseMap[entry.exerciseId];
            if (!ex) return null;
            return (
              <ExerciseCard
                key={entry.key}
                entry={entry}
                ex={ex}
                unit={unit}
                analysis={analyses[ex.id]}
                onUpdateEntry={(fn) => updateEntry(entry.key, fn)}
                onRemove={() => removeEntry(entry.key)}
                onSetDone={(setId, done) => onSetDone(entry.key, setId, done)}
                onCustomizeSet={(setId) => setCustomize({ entryKey: entry.key, setId })}
              />
            );
          })}
          <Btn variant="accentGhost" label="Add Exercise" icon={Plus} onPress={() => setPickerOpen(true)} />
          <View style={[styles.row, { marginTop: 10 }]}>
            <Btn
              variant="danger"
              label="Discard"
              icon={Trash2}
              style={{ flex: 1, marginRight: 8 }}
              onPress={() =>
                confirmAction('Discard workout?', 'All sets in this session will be lost.', () =>
                  setData((d) => ({ ...d, workout: null }))
                )
              }
            />
            <Btn
              label="Finish Workout"
              icon={Check}
              style={{ flex: 2 }}
              disabled={doneCount === 0}
              onPress={finishWorkout}
            />
          </View>
        </>
      )}

      <RecentHistory history={data.history} exerciseMap={exerciseMap} unit={unit} />

      {/* Exercise picker */}
      <SheetModal visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Select exercise">
        <ScrollView style={{ maxHeight: 460 }}>
          {grouped.map((g) =>
            g.items.length ? (
              <View key={g.muscle} style={{ marginBottom: 10 }}>
                <Text style={styles.sectionLabel}>{g.muscle}</Text>
                {g.items.map((ex) => {
                  const a = analyses[ex.id];
                  return (
                    <TouchableOpacity key={ex.id} style={styles.pickRow} onPress={() => addExercise(ex)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickName}>{ex.name}</Text>
                        <Text style={styles.mutedSmall}>
                          Target {a.base.sets} × {fmtW(a.prefillWeight)}
                          {unit} × {a.base.reps}
                          {a.deload ? ' · deload' : ''}
                          {a.rec?.kind === 'progress' ? ' · ready to progress' : ''}
                        </Text>
                      </View>
                      <Plus size={18} color={C.accent} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null
          )}
        </ScrollView>
      </SheetModal>

      {/* Set customization */}
      <SheetModal visible={!!customizeSet} onClose={() => setCustomize(null)} title="Customize set">
        {customizeSet ? (
          <View>
            <Text style={styles.label}>Set type</Text>
            {Object.entries(SET_TYPES).map(([key, t]) => (
              <TouchableOpacity
                key={key}
                style={[styles.typeRow, customizeSet.type === key && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                onPress={() => {
                  updateEntry(customize.entryKey, (e) => ({
                    ...e,
                    sets: e.sets.map((s) => (s.id === customize.setId ? { ...s, type: key } : s)),
                  }));
                  setCustomize(null);
                }}
              >
                <View style={[styles.setBadge, { borderColor: t.color }]}>
                  <Text style={[styles.setBadgeText, { color: t.color }]}>{t.short}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.pickName}>{t.label}</Text>
                  <Text style={styles.mutedSmall}>
                    {key === 'standard' && 'Counts toward volume and progression targets.'}
                    {key === 'drop' && 'Reduced-weight follow-up. Counts toward volume only.'}
                    {key === 'warmup' && 'Excluded from weekly volume and progression.'}
                    {key === 'failure' && 'Max effort. Counts toward volume and targets.'}
                  </Text>
                </View>
                {customizeSet.type === key ? <Check size={18} color={C.accent} /> : null}
              </TouchableOpacity>
            ))}
            <Btn
              variant="danger"
              icon={Trash2}
              label="Delete set"
              style={{ marginTop: 8 }}
              onPress={() => {
                updateEntry(customize.entryKey, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== customize.setId) }));
                setCustomize(null);
              }}
            />
          </View>
        ) : null}
      </SheetModal>
    </View>
  );
}

function RecentHistory({ history, exerciseMap, unit }) {
  const recent = useMemo(() => [...history].sort((a, b) => b.date - a.date).slice(0, 8), [history]);
  if (!recent.length) return null;
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={styles.sectionLabel}>Recent sessions</Text>
      {recent.map((log) => {
        const ex = exerciseMap[log.exerciseId];
        const working = log.sets.filter((s) => s.type !== 'warmup');
        return (
          <View key={log.id} style={styles.historyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pickName}>{ex ? ex.name : 'Deleted exercise'}</Text>
              <Text style={styles.mutedSmall}>
                {fmtDate(log.date)} · {working.map((s) => `${fmtW(s.weight)}×${s.reps}`).join(', ')} {unit}
              </Text>
            </View>
            <Text style={[styles.hitTag, { color: log.isDeload ? C.warn : log.hit ? C.accent : C.danger }]}>
              {log.isDeload ? 'DELOAD' : log.hit ? 'HIT' : 'MISS'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Volume dashboard                                                    */
/* ------------------------------------------------------------------ */

function VolumeScreen({ data, exerciseMap }) {
  const counts = useMemo(
    () => computeWeeklyVolume(data.history, data.workout, exerciseMap),
    [data.history, data.workout, exerciseMap]
  );
  const max = Math.max(12, ...Object.values(counts));
  const needs = MUSCLES.filter((m) => counts[m] < MIN_WEEKLY_SETS);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <View>
      <Text style={styles.h1}>Weekly Volume</Text>
      <Text style={[styles.mutedSmall, { marginBottom: 12 }]}>
        Working sets over the last 7 days (warmups excluded, includes today’s checked sets)
      </Text>

      <View style={[styles.row, { marginBottom: 12 }]}>
        <Card style={[styles.statCard, { marginRight: 8 }]}>
          <Text style={styles.statNum}>{total}</Text>
          <Text style={styles.mutedSmall}>total sets</Text>
        </Card>
        <Card style={[styles.statCard, needs.length && { borderColor: C.warn }]}>
          <Text style={[styles.statNum, { color: needs.length ? C.warn : C.accent }]}>{needs.length}</Text>
          <Text style={styles.mutedSmall}>need attention</Text>
        </Card>
      </View>

      <Card>
        {MUSCLES.map((m) => {
          const n = counts[m];
          const low = n < MIN_WEEKLY_SETS;
          return (
            <View key={m} style={styles.volRow}>
              <View style={styles.rowBetween}>
                <View style={styles.row}>
                  <Text style={styles.volName}>{m}</Text>
                  {low ? (
                    <View style={styles.attnBadge}>
                      <TriangleAlert size={11} color="#000" />
                      <Text style={styles.attnText}>ATTENTION NEEDED</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.volCount, { color: low ? C.warn : C.accent }]}>{n}</Text>
              </View>
              <View style={styles.volTrack}>
                <View
                  style={[styles.volFill, { width: `${Math.min(100, (n / max) * 100)}%`, backgroundColor: low ? C.warn : C.accent }]}
                />
                <View style={[styles.volMarker, { left: `${(MIN_WEEKLY_SETS / max) * 100}%` }]} />
              </View>
            </View>
          );
        })}
        <Text style={[styles.mutedSmall, { marginTop: 6 }]}>
          Marker = {MIN_WEEKLY_SETS}-set minimum per muscle group.
        </Text>
      </Card>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Settings / deload                                                   */
/* ------------------------------------------------------------------ */

function SettingsScreen({ data, setData, exercises }) {
  const s = data.settings;
  const setSettings = (patch) => setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const [form, setForm] = useState({ name: '', muscle: 'Chest', startWeight: '20', repMin: '8', repMax: '12', increment: '2.5' });

  const flags = useMemo(
    () =>
      exercises
        .map((ex) => ({ ex, a: analyzeExercise(ex, data.history, { ...s, manualDeload: false }) }))
        .filter(({ a }) => a.autoDeload || a.failStreak === 1),
    [exercises, data.history, s]
  );

  const addCustom = () => {
    const name = form.name.trim();
    if (!name) return;
    const repMin = Math.max(1, Math.round(num(form.repMin)));
    const repMax = Math.max(repMin, Math.round(num(form.repMax)));
    const ex = {
      id: `custom-${uid()}`,
      name,
      muscle: form.muscle,
      startWeight: num(form.startWeight),
      repMin,
      repMax,
      increment: num(form.increment) || 2.5,
      sets: 3,
      custom: true,
    };
    setSettings({ customExercises: [...(s.customExercises || []), ex] });
    setForm({ ...form, name: '' });
  };

  return (
    <View>
      <Text style={[styles.h1, { marginBottom: 12 }]}>Settings</Text>

      <Card>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.h2}>Trigger Deload Week</Text>
            <Text style={styles.mutedSmall}>Scales every weight recommendation back by 10%.</Text>
          </View>
          <Switch
            value={!!s.manualDeload}
            onValueChange={(v) => setSettings({ manualDeload: v })}
            trackColor={{ false: C.border, true: C.accent }}
            thumbColor={s.manualDeload ? '#fff' : '#d4d4d8'}
            activeThumbColor="#fff"
          />
        </View>
      </Card>

      <Card>
        <Text style={styles.h2}>Auto-deload monitor</Text>
        <Text style={[styles.mutedSmall, { marginBottom: 8 }]}>
          An exercise is auto-deloaded after missing its targets 2 sessions in a row. Completing the deload session clears the flag.
        </Text>
        {flags.length === 0 ? (
          <Text style={[styles.muted, { color: C.accent }]}>All movements on track.</Text>
        ) : (
          flags.map(({ ex, a }) => (
            <View key={ex.id} style={styles.historyRow}>
              <Text style={[styles.pickName, { flex: 1 }]}>{ex.name}</Text>
              <Text style={[styles.hitTag, { color: a.autoDeload ? C.warn : C.muted }]}>
                {a.autoDeload ? 'DELOAD FLAGGED' : '1 MISS'}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={styles.h2}>Units</Text>
        <View style={[styles.row, { marginTop: 8 }]}>
          {['kg', 'lb'].map((u) => (
            <Chip key={u} label={u.toUpperCase()} active={s.unit === u} onPress={() => setSettings({ unit: u })} />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.h2}>Add custom exercise</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={form.name}
          onChangeText={(v) => setForm({ ...form, name: v })}
          style={styles.input}
          placeholder="e.g. Cable Fly"
          placeholderTextColor={C.muted}
        />
        <Text style={styles.label}>Muscle group</Text>
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          {MUSCLES.map((m) => (
            <Chip key={m} label={m} active={form.muscle === m} onPress={() => setForm({ ...form, muscle: m })} />
          ))}
        </View>
        <View style={[styles.row, { marginTop: 4 }]}>
          {[
            ['startWeight', `Start (${s.unit})`],
            ['repMin', 'Rep min'],
            ['repMax', 'Rep max'],
            ['increment', 'Step'],
          ].map(([k, label], i) => (
            <View key={k} style={{ flex: 1, marginLeft: i ? 6 : 0 }}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                value={form[k]}
                onChangeText={(v) => setForm({ ...form, [k]: v })}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
          ))}
        </View>
        <Btn label="Add Exercise" icon={Plus} style={{ marginTop: 12 }} onPress={addCustom} disabled={!form.name.trim()} />
        {(s.customExercises || []).map((ex) => (
          <View key={ex.id} style={styles.historyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pickName}>{ex.name}</Text>
              <Text style={styles.mutedSmall}>
                {ex.muscle} · {ex.repMin}–{ex.repMax} reps · +{ex.increment}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setSettings({ customExercises: s.customExercises.filter((c) => c.id !== ex.id) })}
              hitSlop={8}
            >
              <Trash2 size={16} color={C.danger} />
            </TouchableOpacity>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.h2}>Data</Text>
        <Text style={[styles.mutedSmall, { marginBottom: 10 }]}>
          {data.history.length} logged exercise sessions, stored offline on this device.
        </Text>
        <Btn
          variant="danger"
          icon={RotateCcw}
          label="Reset all data"
          onPress={() =>
            confirmAction('Reset all data?', 'This deletes your entire training history and cannot be undone.', () =>
              setData(DEFAULT_DATA)
            )
          }
        />
      </Card>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* App root                                                            */
/* ------------------------------------------------------------------ */

const TABS = [
  { key: 'workout', label: 'Workout', icon: Dumbbell },
  { key: 'volume', label: 'Volume', icon: Activity },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('workout');
  const [timer, setTimer] = useState(null); // { endAt, duration }
  const saveRef = useRef(null);

  // Load from AsyncStorage (localStorage on web)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setData({
            ...DEFAULT_DATA,
            ...parsed,
            settings: { ...DEFAULT_DATA.settings, ...(parsed.settings || {}) },
          });
        }
      } catch (e) {
        console.warn('Failed to load data', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Debounced persist
  useEffect(() => {
    if (!loaded) return undefined;
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((e) => console.warn('Save failed', e));
    }, 250);
    return () => clearTimeout(saveRef.current);
  }, [data, loaded]);

  // Rest timer expiry → vibration + audio cue
  useEffect(() => {
    if (!timer) return undefined;
    const ms = Math.max(0, timer.endAt - Date.now());
    const id = setTimeout(() => {
      playAlarm();
      setTimer(null);
    }, ms);
    return () => clearTimeout(id);
  }, [timer]);

  const restSeconds = data.settings.restSeconds;
  const startRest = useCallback(
    (secs) => {
      const d = secs || restSeconds;
      setTimer({ endAt: Date.now() + d * 1000, duration: d });
    },
    [restSeconds]
  );

  const exercises = useMemo(
    () => [...DEFAULT_EXERCISES, ...(data.settings.customExercises || [])],
    [data.settings.customExercises]
  );
  const exerciseMap = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises]);
  const unit = data.settings.unit;

  if (!loaded) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Dumbbell size={36} color={C.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.row}>
          <View style={styles.logo}>
            <TrendingUp size={16} color="#000" strokeWidth={3} />
          </View>
          <Text style={styles.brand}>OVERLOAD</Text>
        </View>
        {data.settings.manualDeload ? <Text style={[styles.tag, { color: C.warn, borderColor: C.warn }]}>DELOAD</Text> : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          {tab === 'workout' && (
            <WorkoutScreen
              data={data}
              setData={setData}
              exercises={exercises}
              exerciseMap={exerciseMap}
              unit={unit}
              startRest={() => startRest()}
            />
          )}
          {tab === 'volume' && <VolumeScreen data={data} exerciseMap={exerciseMap} />}
          {tab === 'settings' && <SettingsScreen data={data} setData={setData} exercises={exercises} />}
        </View>
      </ScrollView>

      {tab === 'workout' ? (
        <View style={styles.container}>
          <RestTimerBar
            timer={timer}
            restSeconds={restSeconds}
            onPreset={(sec) => {
              primeAudio();
              setData((d) => ({ ...d, settings: { ...d.settings, restSeconds: sec } }));
              if (timer) startRest(sec);
            }}
            onCustom={(sec) => {
              primeAudio();
              setData((d) => ({ ...d, settings: { ...d.settings, restSeconds: sec } }));
            }}
            onSkip={() => setTimer(null)}
            onAdd={() => setTimer((t) => (t ? { endAt: t.endAt + 15000, duration: t.duration + 15 } : t))}
          />
        </View>
      ) : null}

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <TouchableOpacity key={t.key} style={styles.tabItem} onPress={() => setTab(t.key)} activeOpacity={0.7}>
              <Icon size={22} color={active ? C.accent : C.muted} />
              <Text style={[styles.tabLabel, { color: active ? C.accent : C.muted }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, ...(Platform.OS === 'web' ? { height: '100vh' } : {}) },
  header: {
    paddingTop: Platform.OS === 'web' ? 14 : 48,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: C.card2,
  },
  logo: { width: 26, height: 26, borderRadius: 7, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  brand: { color: C.text, fontSize: 17, fontWeight: '800', letterSpacing: 3, marginLeft: 10 },
  content: { padding: 16, paddingBottom: 32 },
  container: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: C.text, fontSize: 22, fontWeight: '800' },
  h2: { color: C.text, fontSize: 16, fontWeight: '700' },
  muted: { color: C.muted, fontSize: 14 },
  mutedSmall: { color: C.muted, fontSize: 12, marginTop: 2 },
  label: { color: C.muted, fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionLabel: { color: C.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.card2 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 9 },
  btnText: { fontWeight: '700', fontSize: 15 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: { color: C.text, fontWeight: '600', fontSize: 13 },
  tag: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
    overflow: 'hidden',
  },
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.accentDim,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  prText: { color: C.accent, fontWeight: '800', fontSize: 12, marginLeft: 5 },
  recBanner: { marginTop: 12, borderWidth: 1, borderRadius: 12, padding: 12, backgroundColor: C.card2 },
  recTitle: { fontWeight: '800', fontSize: 14 },
  recDetail: { color: C.text, fontSize: 13, marginTop: 2, opacity: 0.85 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card2,
    borderRadius: 12,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  setBadge: { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  setBadgeText: { fontWeight: '800', fontSize: 13 },
  setInputs: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  setField: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 8, paddingRight: 6 },
  setInput: {
    flex: 1,
    minWidth: 0,
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 8,
    paddingHorizontal: 8,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  setUnit: { color: C.muted, fontSize: 11 },
  times: { color: C.muted, marginHorizontal: 6, fontSize: 14 },
  iconBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  doneBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prMini: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.accent,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginLeft: 6,
  },
  prMiniText: { color: '#000', fontWeight: '900', fontSize: 10, marginLeft: 2 },
  deloadStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.warn,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  deloadStripText: { color: '#000', fontWeight: '800', marginLeft: 8, fontSize: 13, letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: 16 },
  modalCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    maxHeight: '90%',
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: C.card2,
    borderRadius: 10,
    marginBottom: 6,
  },
  pickName: { color: C.text, fontWeight: '600', fontSize: 15 },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
  },
  input: {
    backgroundColor: C.bg,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.card2,
  },
  hitTag: { fontWeight: '800', fontSize: 11, letterSpacing: 1, marginLeft: 8 },
  statCard: { flex: 1, marginBottom: 0, alignItems: 'flex-start' },
  statNum: { color: C.accent, fontSize: 30, fontWeight: '900' },
  volRow: { marginBottom: 14 },
  volName: { color: C.text, fontWeight: '700', fontSize: 15 },
  volCount: { fontWeight: '900', fontSize: 16 },
  volTrack: { height: 8, backgroundColor: C.card2, borderRadius: 4, marginTop: 6, overflow: 'hidden' },
  volFill: { height: 8, borderRadius: 4 },
  volMarker: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: C.text, opacity: 0.6 },
  attnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.warn,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  attnText: { color: '#000', fontWeight: '900', fontSize: 10, letterSpacing: 0.5, marginLeft: 3 },
  timerBar: {
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  timerProgressTrack: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: C.card2 },
  timerProgressFill: { height: 3, backgroundColor: C.accent },
  timerText: { fontSize: 22, fontWeight: '900', marginLeft: 8, fontVariant: ['tabular-nums'] },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.card2,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, fontWeight: '700', marginTop: 3 },
});
