import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, StatusBar, ActivityIndicator, Image } from 'react-native';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseEpub } from '../utils/epubParser';
import { Tabs, useRouter } from 'expo-router';

import { Directory, File } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';

export default function LibraryScreen() {
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [epubs, setEpubs] = useState<{ uri: string; name: string; title: string; author: string; cover: string | null }[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [fontsLoaded] = useFonts({
    LibertinusSans: require('../assets/fonts/LibertinusSans.ttf'),
    UbuntuM: require('../assets/fonts/UbuntuMedium.ttf'),
  });

  const router = useRouter();

  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await AsyncStorage.getItem('global-theme');
      if (savedTheme === 'dark') setIsDarkMode(true);
    };
    loadTheme();
  }, []);

  const scanForEpubs = useCallback(async (uri: string) => {
    setIsScanning(true);

    try {
      const dir = new Directory(uri);
      const contents = dir.list();

      const rawEpubFiles = contents.filter((item: any) => 
        item instanceof File && item.name.toLowerCase().endsWith('.epub')
      );

      const cachedData = await AsyncStorage.getItem('@book_cache');
      const cachedBooks: any[] = cachedData ? JSON.parse(cachedData) : [];

      let needsCacheUpdate = false;

      const parsedBooks = await Promise.all(
        rawEpubFiles.map(async (file: any) => {

          const existingBook = cachedBooks.find(b => b.name === file.name);
          if (existingBook) {
            return existingBook; 
          }

          needsCacheUpdate = true;
          const metadata = await parseEpub(file.uri);
          
          let savedCoverUri = null;

          if (metadata.cover) {
            try {
              const cleanFileName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
              const coverPath = `${FileSystemLegacy.cacheDirectory}${cleanFileName}_cover.jpg`;

              let base64Data = metadata.cover;
              if (base64Data.includes('base64,')) {
                base64Data = base64Data.split('base64,')[1];
              }

              await FileSystemLegacy.writeAsStringAsync(coverPath, base64Data, {
                encoding: FileSystemLegacy.EncodingType.Base64,
              });
              
              savedCoverUri = coverPath; 
            } catch (coverError) {
              console.log("Failed to save cover image for", file.name);
            }
          }

          return {
            uri: file.uri,
            name: file.name,
            title: metadata.title !== 'Unknown Title' ? metadata.title : file.name.replace('.epub', ''),
            author: metadata.author,
            cover: savedCoverUri, 
          };
        })
      );

      // 3. Save to cache
      if (needsCacheUpdate || parsedBooks.length !== cachedBooks.length) {
        await AsyncStorage.setItem('@book_cache', JSON.stringify(parsedBooks));
      }

      setEpubs(parsedBooks);
    } catch (error) {
      console.error('Error reading directory:', error);
      setEpubs([]);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const checkSavedFolder = useCallback(async () => {
    try {
      const savedUri = await AsyncStorage.getItem('epubFolderUri');
      if (savedUri) {
        setFolderUri(savedUri);
        await scanForEpubs(savedUri);
      }
    } catch (error) {
      console.error('Failed to load saved folder:', error);
    }
  }, [scanForEpubs]);

  useEffect(() => {
    checkSavedFolder();
  }, [checkSavedFolder]);

  const handleSelectFolder = async () => {
    try {
      const dir = await Directory.pickDirectoryAsync();

      if (!dir) {
        console.log('User cancelled folder picker');
        return; 
      }

      setFolderUri(dir.uri);
      await AsyncStorage.setItem('epubFolderUri', dir.uri);
      await scanForEpubs(dir.uri);
    } catch (error) {
      console.error('Error picking folder:', error);
    }
  };

  const handleOpenBook = async (bookUri: string, bookTitle: string) => {
    setIsScanning(true); 
    try {
      const cleanTitle = bookTitle.replace(/[^a-zA-Z0-9]/g, '_');
      const localUri = `${FileSystemLegacy.cacheDirectory}${cleanTitle}.epub`;

      await FileSystemLegacy.copyAsync({
        from: bookUri,
        to: localUri
      });

      router.push({ pathname: '/reader', params: { uri: localUri, title: bookTitle } });
    } catch (error) {
      console.error("Failed to copy book to cache:", error);
    } finally {
      setIsScanning(false);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, isDarkMode && styles.containerDark]}>
      <Tabs.Screen options={{ headerShown: false, tabBarStyle: { display: 'none' } }} />
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={isDarkMode ? "#121212" : "#EAE8E3"} />

      <View style={[styles.header, isDarkMode && styles.headerDark]}>
        <Text style={[styles.headerText, isDarkMode && styles.textDark]}>My Library</Text>
        
        {folderUri && (
          <TouchableOpacity onPress={handleSelectFolder} style={styles.folderButton} activeOpacity={0.7}>
             <Image 
               source={require('../assets/images/folder.png')} 
               style={[styles.folderIconImage, isDarkMode && styles.folderIconDark]} 
             />
          </TouchableOpacity>
        )}
      </View>

      {isScanning && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#6B6E62" />
          <Text style={[styles.emptyText, isDarkMode && styles.textDarkSecondary]}>Loading your books...</Text>
        </View>
      )}

      {!folderUri && !isScanning && (
        <View style={styles.centerContent}>
          <Text style={[styles.emptyText, isDarkMode && styles.textDarkSecondary]}>No library folder selected.</Text>
          <TouchableOpacity style={styles.button} onPress={handleSelectFolder} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Add EPUB Folder</Text>
          </TouchableOpacity>
        </View>
      )}

      {folderUri && epubs.length === 0 && !isScanning && (
        <View style={styles.centerContent}>
          <Text style={[styles.emptyText, isDarkMode && styles.textDarkSecondary]}>No EPUBs found in this folder.</Text>
          <TouchableOpacity style={[styles.buttonOutline, isDarkMode && styles.buttonOutlineDark]} onPress={handleSelectFolder} activeOpacity={0.8}>
            <Text style={[styles.buttonOutlineText, isDarkMode && styles.textDarkSecondary]}>Change Folder</Text>
          </TouchableOpacity>
        </View>
      )}

      {folderUri && epubs.length > 0 && !isScanning && (
        <FlatList
          data={epubs}
          keyExtractor={(item) => item.uri}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            return (
              <TouchableOpacity style={styles.bookCard} activeOpacity={0.7} onPress={() => handleOpenBook(item.uri, item.title)}>
                {item.cover ? (
                  <Image 
                    source={{ uri: item.cover }} 
                    style={styles.realCoverImage} 
                  />
                ) : (
                  <View style={styles.coverPlaceholder}>
                    <Text style={styles.coverPlaceholderText}>
                      {item.title.substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}

                <Text style={[styles.bookTitle, isDarkMode && styles.textDark]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={[styles.bookAuthor, isDarkMode && styles.textDarkSecondary]} numberOfLines={1}>
                  {item.author}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EAE8E3' },
  containerDark: { backgroundColor: '#121212' },
  
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#DCDACF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerDark: { borderBottomColor: '#333333' },
  headerText: { fontFamily: 'UbuntuM', fontSize: 32, color: '#333333' },
  
  folderButton: { padding: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8 },
  folderIcon: { fontSize: 22 },

  textDark: { color: '#E0E0E0' },
  textDarkSecondary: { color: '#A0A0A0' },

  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  emptyText: { fontFamily: 'LibertinusSans', fontSize: 18, color: '#6B6E62', marginBottom: 24, marginTop: 12 },
  
  button: { backgroundColor: '#b8c9ce', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 4 },
  buttonText: { fontFamily: 'LibertinusSans', color: '#FFFFFF', fontSize: 18 },
  
  buttonOutline: { borderWidth: 2, borderColor: '#b8c9ce', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 4 },
  buttonOutlineDark: { borderColor: '#4A4A4A' },
  buttonOutlineText: { fontFamily: 'LibertinusSans', color: '#6B6E62', fontSize: 18 },
  
  listContainer: { padding: 24, paddingBottom: 100 },
  row: { justifyContent: 'space-between', marginBottom: 24 },
  bookCard: { width: '47%' },

  folderIconImage: { 
    width: 24, 
    height: 24, 
    resizeMode: 'contain',
    tintColor: '#333333'
  },
  folderIconDark: { 
    tintColor: '#E0E0E0'
  },
  
  coverPlaceholder: { backgroundColor: '#DCDACF', aspectRatio: 2 / 3, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 10, elevation: 5 },
  coverPlaceholderText: { fontFamily: 'UbuntuM', fontSize: 32, color: '#EAE8E3', opacity: 0.5 },
  realCoverImage: { width: '100%', aspectRatio: 2 / 3, borderRadius: 8, marginBottom: 10, resizeMode: 'cover' },
  
  bookTitle: { fontFamily: 'LibertinusSans', fontSize: 16, color: '#333333', marginBottom: 4, lineHeight: 20 },
  bookAuthor: { fontFamily: 'LibertinusSans', fontSize: 14, color: '#8C887F' },
});