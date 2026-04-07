import React from 'react';
import { Stack } from 'expo-router';
import { ReaderProvider } from '@epubjs-react-native/core';

export default function RootLayout() {
  return (
    <ReaderProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="library" />
        <Stack.Screen name="reader" />
      </Stack>
    </ReaderProvider>
  );
}