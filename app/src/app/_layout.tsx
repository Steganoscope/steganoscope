import '../lib/polyfills.ts';
import { router } from 'expo-router';
import Tabs from 'expo-router/js-tabs';
import { useIncomingShare } from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { BusyProvider } from '../lib/busy.tsx';
import { AppProvider } from '../lib/state.tsx';
import { engineError } from '../lib/engine.ts';
import { Label, Screen, useColors } from '../components/ui.tsx';

// Opens the share screen when another app shares a file to Steganoscope.
// Leaves a running program. The tab bar is hidden there and iOS has no back button, so the header has one.
function Close() {
  const c = useColors();
  return (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} accessibilityRole="button"
      accessibilityLabel="Close program" hitSlop={12} style={{ paddingHorizontal: 16 }}>
      <Text style={{ color: c.accent, fontSize: 17, fontWeight: '600' }}>Close</Text>
    </Pressable>
  );
}

function IncomingShare() {
  const { sharedPayloads } = useIncomingShare();
  useEffect(() => { if (sharedPayloads.length) router.push('/share'); }, [sharedPayloads]);
  return null;
}

export default function Layout() {
  const c = useColors();
  if (engineError) return <Screen style={{ justifyContent: 'center' }}><Label>{engineError}</Label></Screen>;
  return (
    <AppProvider>
      <BusyProvider>
      <IncomingShare />
      <StatusBar style="auto" />
      <Tabs screenOptions={{
        headerStyle: { backgroundColor: c.card }, headerTintColor: c.fg,
        tabBarStyle: { backgroundColor: c.card }, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.dim,
        tabBarIconStyle: { display: 'none' }, tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
      }}>
        <Tabs.Screen name="index" options={{ title: 'Receive' }} />
        <Tabs.Screen name="broadcast" options={{ title: 'Broadcast' }} />
        <Tabs.Screen name="library" options={{ title: 'Library' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        <Tabs.Screen name="item/[id]" options={{ href: null, title: 'Item' }} />
        <Tabs.Screen name="run/[id]" options={{ href: null, title: 'Program', tabBarStyle: { display: 'none' }, headerLeft: () => <Close /> }} />
        <Tabs.Screen name="share" options={{ href: null, title: 'Shared file' }} />
        <Tabs.Screen name="diagnostics" options={{ href: null, title: 'Diagnostics' }} />
      </Tabs>
      </BusyProvider>
    </AppProvider>
  );
}
