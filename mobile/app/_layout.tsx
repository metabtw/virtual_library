import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { withErrorMonitoring } from '../src/telemetry';

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 } },
});

function RootLayout() {
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
    return () => listener.remove();
  }, []);
  return <QueryClientProvider client={client}>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#1b1620' } }} />
  </QueryClientProvider>;
}

export default withErrorMonitoring(RootLayout);
