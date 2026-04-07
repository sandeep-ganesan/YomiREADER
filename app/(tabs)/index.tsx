import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, Image } from 'react-native';
import { useFonts } from 'expo-font';
import { Tabs, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [fontsLoaded] = useFonts({
    'AmaticSC': require('../assets/fonts/AmaticSC.ttf'),
    'PEduCursive': require('../assets/fonts/EduCursive.ttf'),
    'Libertinus': require('../assets/fonts/LibertinusSans.ttf'),
    'UbuntuM': require('../assets/fonts/UbuntuMedium.ttf'),
  });

  const router = useRouter();

  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await AsyncStorage.getItem('global-theme');
      if (savedTheme === 'dark') setIsDarkMode(true);
    };
    loadTheme();
  }, []);

  const handleEnterApp = () => {
    router.push('/library'); 
  };

  if (!fontsLoaded) {
    return null; 
  }

  return (
    <View style={[styles.container, isDarkMode && styles.containerDark]}>
      <Tabs.Screen 
        options={{ 
          headerShown: false,
          tabBarStyle: { display: 'none' } 
        }} 
      />

      <Image
        source={require('../assets/images/initial_splashscreen.png')}
        style={styles.logo}
      />

      <Text style={[styles.titleText, isDarkMode && styles.textDark]}>読READER</Text>

      <Text style={[styles.subtitleText, isDarkMode && styles.textDarkSecondary]}>
        This app is designed to use a local AI model to help you search for contextual clues to better understand the content you consume!
      </Text>
      
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={isDarkMode ? "#121212" : "#EAE8E3"} />

      <TouchableOpacity 
        style={styles.button} 
        onPress={handleEnterApp}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Tap Here!</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EAE8E3', 
    justifyContent: 'center',
    alignItems: 'center', 
    paddingBottom: 140,
    paddingTop: 50,
  },
  containerDark: {
    backgroundColor: '#121212',
  },
  logo: {
    width: 400,
    height: 400,
    marginBottom: 30, 
  },
  titleText: {
    fontFamily: 'Libertinus',
    fontSize: 42,
    color: '#333333', 
    marginBottom: 8,
  },
  textDark: {
    color: '#E0E0E0',
  },
  subtitleText: {
    fontFamily: 'PEduCursive', 
    fontSize: 12,
    color: '#6B6E62', 
    paddingHorizontal: 40,
    textAlign: 'center',
    marginTop: 10,
  },
  textDarkSecondary: {
    color: '#A0A0A0',
  },
  button: {
    backgroundColor: '#b8c9ce',
    paddingVertical: 16,
    paddingHorizontal: 108,
    borderRadius: 4,
    marginTop: 30,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'Libertinus'
  },
});