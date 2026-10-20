// Receive: the camera feeds every QR code it sees to the inbox. Streams in progress are listed with
// their progress and rate; each completed item goes to the library.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import type { Progress } from '@steganoscope/protocol/fountain.js';
import { Button, Card, Label, Screen, kb, useColors } from '../components/ui.tsx';
import { useBusy } from '../lib/busy.tsx';
import { statsEnabled } from '../lib/config.ts';
import { Stats } from '../lib/stats.ts';
import type { Event } from '../lib/inbox.ts';
import { useApp } from '../lib/state.tsx';
import { approve, isApproved, withCrl } from '../lib/trust.ts';

type Stream = Progress & { started: number; updated: number };

export default function Receive() {
  const app = useApp(), c = useColors(), focused = useIsFocused(), busy = useBusy();
  const [permission, requestPermission] = useCameraPermissions();
  const [streams, setStreams] = useState<Record<string, Stream>>({});
  const [last, setLast] = useState<string | null>(null);
  const assembling = useRef(false);
  const stats = useRef(new Stats());
  const [, redraw] = useState(0);

  const completed = useCallback((e: Event) => {
    if (e.kind === 'progress' || e.kind === 'ready') return;
    setStreams(({ [e.kind === 'item' ? e.meta.id : e.id]: _, ...rest }) => rest);
    if (e.kind === 'error') return setLast(`Refused: ${e.error}`);
    app.add(e.meta, e.container);
    setLast(`Received ${e.meta.name}${e.meta.private ? ' (private)' : ''}`);
    if (e.opened.crl) app.setTrust(withCrl(app.trust, e.opened.crl));
    const code = e.opened.code;
    if (code?.type === 'html' && app.trust.runPrograms) {
      const run = () => { app.setTrust(approve(app.trust, code)); router.push(`/run/${e.meta.id}`); };
      if (isApproved(app.trust, code)) run();
      else Alert.alert(`Run ${code.id}?`, `Version ${code.version}, signed by ${code.publisher?.name ?? 'Steganoscope'} (key ${code.signer}). It runs offline, isolated from your data.`,
        [{ text: 'Not now', style: 'cancel' }, { text: 'Run', onPress: run }]);
    }
  }, [app]);

  const onCode = useCallback(({ data }: { data: string }) => {
    if (assembling.current) return;
    const e = app.inbox.push(data);
    const now = Date.now();
    if (statsEnabled) {
      const p = e && e.kind !== 'item' && e.kind !== 'error' ? e.progress : null;
      stats.current.scan(now, p);
      if (e?.kind === 'ready') { stats.current.finish(e.progress.id); console.log(stats.current.report()); }
      redraw(x => x + 1);
    }
    if (!e) return;
    if (e.kind === 'progress') {
      setStreams(s => ({ ...s, [e.progress.id]: { ...e.progress, started: s[e.progress.id]?.started ?? now, updated: now } }));
      return;
    }
    if (e.kind === 'ready') {
      assembling.current = true;
      busy(`Assembling ${kb(e.progress.len)}…`, () => app.inbox.finish(e.progress.id))
        .then(completed)
        .finally(() => { assembling.current = false; });
      return;
    }
    completed(e);
  }, [app, busy, completed]);

  if (!permission) return <Screen />;
  if (!permission.granted) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Label>Steganoscope receives by filming QR codes on another screen. It needs the camera for that, and nothing else.</Label>
        <Button kind="primary" title="Allow camera" onPress={requestPermission} />
      </Screen>
    );
  }

  const active = Object.values(streams).filter(s => Date.now() - s.updated < 30_000);
  return (
    <Screen style={{ padding: 0, gap: 0 }}>
      <View style={{ flex: 1 }}>
        {focused && (
          <CameraView style={{ flex: 1 }} facing="back" autofocus="on"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onCode} />
        )}
      </View>
      <View style={{ padding: 16, gap: 8, backgroundColor: c.bg }}>
        {active.length === 0 && <Label dim>Point the camera at a Steganoscope broadcast. Frames can be missed; any enough of them will do.</Label>}
        {active.map(s => {
          const secs = Math.max(0.5, (s.updated - s.started) / 1000);
          return (
            <Card key={s.id}>
              <Label bold>{kb(s.len)} · {Math.floor((100 * s.rank) / s.n)}%</Label>
              <Label dim size={14}>{s.rank} of {s.n} blocks · {kb(Math.round((s.len * s.rank) / s.n / secs))}/s</Label>
            </Card>
          );
        })}
        {statsEnabled && <Label dim size={13}>{stats.current.live(Date.now()) ?? stats.current.report() ?? 'stats on: waiting for codes'}</Label>}
        {last && <Label dim size={14}>{last}</Label>}
      </View>
    </Screen>
  );
}
