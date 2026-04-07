import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Modal, FlatList, DimensionValue, StatusBar, Dimensions, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TapGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';

import { Reader, useReader } from '@epubjs-react-native/core';
import * as FileSystemLegacy from 'expo-file-system/legacy';

import { extractAndChunkEpub } from '../utils/epubChunker';
import { saveVectorCache, searchBook } from '../utils/vectorDatabase';
import { getEmbeddingModel, getGenerationModel } from '../utils/aiManager';

const customFileSystem = () => (FileSystemLegacy as any);

const STATIC_THEMES = {
  light: {
    body: { background: '#FFFFFF !important' },
    'p, h1, h2, h3, h4, h5, h6, span, div, a': { color: '#333333 !important' }
  },
  dark: {
    body: { background: '#121212 !important' },
    'p, h1, h2, h3, h4, h5, h6, span, div, a': { color: '#E0E0E0 !important' }
  }
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

export default function ReaderScreen() {
  const router = useRouter();
  const { uri, title } = useLocalSearchParams<{ uri: string, title: string }>();
  const insets = useSafeAreaInsets(); 
  
  const { 
    changeTheme, changeFontSize, changeFontFamily, 
    toc, goToLocation, currentLocation, getLocations,
    goNext, goPrevious 
  } = useReader();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState('serif');
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [initialLocation, setInitialLocation] = useState<string | undefined>(undefined);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [isUiVisible, setIsUiVisible] = useState(true);

  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: '0',
    role: 'ai',
    text: `Hi! I've read "${title}". What would you like to know?`
  }]);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const [pos, theme, size, font] = await Promise.all([
        AsyncStorage.getItem(`pos-${title}`),
        AsyncStorage.getItem('global-theme'),
        AsyncStorage.getItem('global-size'),
        AsyncStorage.getItem('global-font')
      ]);

      if (pos) setInitialLocation(pos);
      if (theme === 'dark') setIsDarkMode(true);
      if (size) setFontSize(parseInt(size));
      if (font) setFontFamily(font);

      setIsStorageReady(true);
    };
    loadSettings();
  }, [title]);

  useEffect(() => {
    if (currentLocation?.start?.cfi) {
      AsyncStorage.setItem(`pos-${title}`, currentLocation.start.cfi);
    }
  }, [currentLocation, title]);

  useEffect(() => {
    if (currentLocation && isStorageReady) {
      changeTheme(isDarkMode ? STATIC_THEMES.dark : STATIC_THEMES.light);
      changeFontSize(`${fontSize}px`);
      changeFontFamily(fontFamily);
    }
  }, [currentLocation, isDarkMode, fontSize, fontFamily, isStorageReady]);

  const [fontsLoaded] = useFonts({
    LibertinusSans: require('../assets/fonts/LibertinusSans.ttf'),
    UbuntuM: require('../assets/fonts/UbuntuMedium.ttf'),
  });

  if (!fontsLoaded || !isStorageReady) return <ActivityIndicator style={{ flex: 1 }} />;

  const progressPercentage = currentLocation?.start?.percentage 
    ? (currentLocation.start.percentage * 100).toFixed(1) 
    : 0;

  const handleToggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    AsyncStorage.setItem('global-theme', next ? 'dark' : 'light');
    changeTheme(next ? STATIC_THEMES.dark : STATIC_THEMES.light);
  };

  const handleFontChange = (size: number) => {
    const newSize = Math.max(12, Math.min(32, size));
    setFontSize(newSize);
    AsyncStorage.setItem('global-size', newSize.toString());
    changeFontSize(`${newSize}px`);
  };

  const handleStyleChange = (family: string) => {
    setFontFamily(family);
    AsyncStorage.setItem('global-font', family);
    changeFontFamily(family);
  };

  const handleChapterJump = (href: string) => {
    setShowToc(false);
    setIsUiVisible(false);
    setTimeout(() => {
      goToLocation(href);
    }, 150);
  };

  const handleAskAI = async () => {
    setIsUiVisible(false); 

    const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
    const path = `${FileSystemLegacy.documentDirectory}${cleanTitle}_vectors.json`;
    const info = await FileSystemLegacy.getInfoAsync(path);

    if (info.exists) {
      setShowChat(true);
      return;
    }

    setIsProcessingAi(true);
    try {
      const chunks = await extractAndChunkEpub(uri, title, setAiStatus);
      const aiEngine = await getEmbeddingModel(setAiStatus);

      const vectorRecords = [];
      for (let i = 0; i < chunks.length; i++) {
        setAiStatus(`Analyzing chapter concepts... (${i + 1}/${chunks.length})`);
        const result = await aiEngine.embedding(chunks[i].text);
        
        vectorRecords.push({ 
          id: chunks[i].id, 
          index: i,
          text: chunks[i].text, 
          embedding: result.embedding 
        });
      }

      setAiStatus("Saving AI memory cache...");
      await saveVectorCache(title, vectorRecords);
      await aiEngine.release(); 
      
      setAiStatus("Book analysis complete!");
      setTimeout(() => {
        setIsProcessingAi(false);
        setShowChat(true); 
      }, 1000);

    } catch (error) {
      console.error("AI Processing failed:", error);
      setAiStatus("Failed to process book.");
      setTimeout(() => setIsProcessingAi(false), 2000);
    }
  };

const handleSendMessage = async () => {
    if (!chatInput.trim() || isAiTyping) return;

    const userQuestion = chatInput.trim();
    setChatInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userQuestion }]);
    setIsAiTyping(true);

    try {
      const embEngine = await getEmbeddingModel(() => {}); 
      const qVector = await embEngine.embedding(userQuestion);
      await embEngine.release();

      const contextChunks = await searchBook(title, qVector.embedding, 1); // Maybe change to 2 for more context, but watch the token limit!
      const contextText = contextChunks.join('\n\n');

      const genEngine = await getGenerationModel(() => {});

      const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are an insightful reading assistant. Answer the user's question using ONLY the provided Context. You must write a full, detailed paragraph explaining your answer. Do not use outside knowledge.
Context:
${contextText}<|eot_id|><|start_header_id|>user<|end_header_id|>

${userQuestion}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

`; 

      const response = await genEngine.completion({
        prompt: prompt,
        n_predict: 512,
        temperature: 0.7, 
        top_p: 0.9,       
      });

      await genEngine.release(); 

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: response.text }]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: "Sorry, my neural engine encountered an error." }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      
      <StatusBar 
        hidden={!isUiVisible && !showChat} 
        translucent={true}
        barStyle={isDarkMode ? 'light-content' : 'dark-content'} 
        backgroundColor="transparent" 
      />

      <View style={[styles.container, isDarkMode && styles.containerDark]}>
        
        <TapGestureHandler
          onHandlerStateChange={({ nativeEvent }) => {
            if (nativeEvent.state === State.ACTIVE && !isProcessingAi && !showChat) {
              const tapX = nativeEvent.absoluteX;

              if (tapX < SCREEN_WIDTH * 0.3) {
                goPrevious();
              } else if (tapX > SCREEN_WIDTH * 0.7) {
                goNext();
              } else {
                setIsUiVisible((prev) => !prev);
              }
            }
          }}
          cancelsTouchesInView={false}
        >
          <View style={[styles.readerContainer, isDarkMode && styles.containerDark]}>
            <Reader
              src={uri}
              width="100%"
              height="100%"
              fileSystem={customFileSystem}
              flow="paginated"
              spread="none" 
              initialLocation={initialLocation}
              onStarted={() => { 
                getLocations(); 
              }}
            />
            
            {/* AI Processing Overlay */}
            {isProcessingAi && (
              <View style={[styles.aiOverlay, isDarkMode && styles.aiOverlayDark]}>
                <ActivityIndicator size="large" color={isDarkMode ? "#E0E0E0" : "#6B6E62"} />
                <Text style={[styles.aiOverlayText, isDarkMode && styles.textDark]}>{aiStatus}</Text>
              </View>
            )}

          </View>
        </TapGestureHandler>

        {isUiVisible && !isProcessingAi && !showChat && (
          <>
            <View style={[
              styles.headerFloating, 
              isDarkMode && styles.headerDark,
              { paddingTop: Math.max(insets.top, 20) + 10 } 
            ]}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                <Text style={[styles.iconText, isDarkMode && styles.textDark]}>← Back</Text>
              </TouchableOpacity>
              <Text style={[styles.titleText, isDarkMode && styles.titleDark]} numberOfLines={1}>{title}</Text>
              <TouchableOpacity onPress={() => setShowToc(true)} style={styles.iconButton}>
                <Text style={[styles.iconText, isDarkMode && styles.textDark]}>☰</Text>
              </TouchableOpacity>
            </View>

            <View style={[
              styles.bottomFloating, 
              isDarkMode && styles.headerDark,
              { paddingBottom: Math.max(insets.bottom, 15) }
            ]}>
              <View style={styles.progressContainer}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progressPercentage}%` as DimensionValue }]} />
                </View>
                <Text style={[styles.progressText, isDarkMode && styles.textDark]}>{progressPercentage}%</Text>
              </View>

              <View style={styles.bottomBar}>
                <TouchableOpacity onPress={handleToggleTheme} style={styles.bottomButton}>
                  <Text style={[styles.bottomButtonText, isDarkMode && styles.textDark]}>{isDarkMode ? 'Light' : 'Dark'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.bottomButton}>
                  <Text style={[styles.bottomButtonText, isDarkMode && styles.textDark]}>Fonts</Text>
                </TouchableOpacity>
                
                <TouchableOpacity onPress={handleAskAI} style={styles.bottomButton}>
                  <Text style={[styles.bottomButtonText, isDarkMode && styles.textDark]}>Ask AI</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        <Modal visible={showChat} animationType="slide" transparent={false}>
          <KeyboardAvoidingView 
            style={[styles.chatContainer, isDarkMode && styles.containerDark]} 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.chatHeader, isDarkMode && styles.headerDark, { paddingTop: Math.max(insets.top, 20) + 10 }]}>
              <TouchableOpacity onPress={() => setShowChat(false)} style={styles.iconButton}>
                <Text style={[styles.iconText, isDarkMode && styles.textDark]}>Close</Text>
              </TouchableOpacity>
              <Text style={[styles.titleText, isDarkMode && styles.titleDark]}>AI Assistant</Text>
              <View style={{ width: 50 }} />
            </View>

            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.chatList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => (
                <View style={[styles.chatBubbleWrapper, item.role === 'user' ? styles.bubbleRight : styles.bubbleLeft]}>
                  <View style={[styles.chatBubble, item.role === 'user' ? styles.bubbleUser : (isDarkMode ? styles.bubbleAiDark : styles.bubbleAiLight)]}>
                    <Text style={[styles.chatText, item.role === 'user' ? styles.textLight : (isDarkMode ? styles.textDark : styles.textDarker)]}>{item.text}</Text>
                  </View>
                </View>
              )}
            />

            <View style={[styles.chatInputArea, isDarkMode && styles.headerDark, { paddingBottom: Math.max(insets.bottom, 15) }]}>
              <TextInput
                style={[styles.chatInput, isDarkMode && styles.chatInputDark]}
                placeholder="Ask about the book..."
                placeholderTextColor={isDarkMode ? "#888" : "#999"}
                value={chatInput}
                onChangeText={setChatInput}
                multiline
                maxLength={200}
              />
              <TouchableOpacity 
                style={[styles.sendBtn, (!chatInput.trim() || isAiTyping) ? styles.sendBtnDisabled : null]} 
                onPress={handleSendMessage}
                disabled={!chatInput.trim() || isAiTyping}
              >
                <Text style={styles.sendBtnText}>{isAiTyping ? "..." : "Send"}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>


        <Modal visible={showToc} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, isDarkMode && styles.modalContentDark]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, isDarkMode && styles.titleDark]}>Chapters</Text>
                <TouchableOpacity onPress={() => setShowToc(false)}><Text style={styles.closeText}>Close</Text></TouchableOpacity>
              </View>
              <FlatList
                data={toc}
                keyExtractor={(item) => item.href}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={styles.tocItem}
                    onPress={() => handleChapterJump(item.href)}
                  >
                    <Text style={[styles.tocText, isDarkMode && styles.textDark]}>{item.label}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        <Modal visible={showSettings} animationType="fade" transparent={true}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSettings(false)}>
            <View style={[styles.settingsBox, isDarkMode && styles.modalContentDark, { paddingBottom: Math.max(insets.bottom, 24) }]}>
              <Text style={[styles.settingsLabel, isDarkMode && styles.textDark]}>Font Size ({fontSize})</Text>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => handleFontChange(fontSize - 2)} style={styles.controlBtn}><Text style={isDarkMode && styles.textDark}>A -</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => handleFontChange(fontSize + 2)} style={styles.controlBtn}><Text style={isDarkMode && styles.textDark}>A +</Text></TouchableOpacity>
              </View>
              <Text style={[styles.settingsLabel, isDarkMode && styles.textDark, { marginTop: 20 }]}>Font Style</Text>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => handleStyleChange('serif')} style={[styles.controlBtn, fontFamily === 'serif' && styles.activeBtn]}><Text style={[{fontFamily: 'serif'}, isDarkMode && styles.textDark]}>Serif</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => handleStyleChange('sans-serif')} style={[styles.controlBtn, fontFamily === 'sans-serif' && styles.activeBtn]}><Text style={isDarkMode && styles.textDark}>Sans</Text></TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F4F0' },
  containerDark: { backgroundColor: '#121212' },
  readerContainer: { flex: 1, paddingTop: 40, paddingBottom: 90 }, 
  
  chatContainer: { flex: 1, backgroundColor: '#F5F4F0' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#DCDACF', backgroundColor: '#EAE8E3' },
  chatList: { padding: 16 },
  chatBubbleWrapper: { marginBottom: 16, maxWidth: '85%' },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  chatBubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  bubbleUser: { backgroundColor: '#8C887F', borderBottomRightRadius: 4 },
  bubbleAiLight: { backgroundColor: '#EAE8E3', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#DCDACF' },
  bubbleAiDark: { backgroundColor: '#1E1E1E', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#333' },
  chatText: { fontFamily: 'LibertinusSans', fontSize: 16, lineHeight: 22 },
  textLight: { color: '#FFFFFF' },
  textDarker: { color: '#333333' },
  chatInputArea: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, backgroundColor: '#EAE8E3', borderTopWidth: 1, borderTopColor: '#DCDACF' },
  chatInput: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, maxHeight: 100, fontSize: 16, fontFamily: 'LibertinusSans' },
  chatInputDark: { backgroundColor: '#1A1A1A', color: '#E0E0E0' },
  sendBtn: { marginLeft: 10, backgroundColor: '#b8c9ce', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#FFFFFF', fontWeight: 'bold' },

  aiOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(245, 244, 240, 0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  aiOverlayDark: { backgroundColor: 'rgba(18, 18, 18, 0.9)' },
  aiOverlayText: { marginTop: 16, fontSize: 16, fontFamily: 'LibertinusSans', color: '#6B6E62' },

  headerFloating: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#DCDACF', backgroundColor: '#EAE8E3' },
  bottomFloating: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, backgroundColor: '#EAE8E3', borderTopWidth: 1, borderTopColor: '#DCDACF' },
  headerDark: { backgroundColor: '#1A1A1A', borderBottomColor: '#333333', borderTopColor: '#333333' },
  
  iconButton: { padding: 8 },
  iconText: { fontSize: 16, color: '#6B6E62', fontWeight: 'bold' },
  textDark: { color: '#B0B0B0' },
  titleText: { fontSize: 16, color: '#333333', maxWidth: '60%', textAlign: 'center', fontWeight: '600' },
  titleDark: { color: '#E0E0E0' },
  
  progressContainer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 5, flexDirection: 'row', alignItems: 'center' },
  progressTrack: { flex: 1, height: 4, backgroundColor: '#DCDACF', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#8C887F' },
  progressText: { fontSize: 12, marginLeft: 10, color: '#6B6E62', width: 40 },
  
  bottomBar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
  bottomButton: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.0)' },
  bottomButtonText: { fontSize: 16, color: '#333333', fontWeight: 'bold' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 20 },
  modalContent: { backgroundColor: '#FFFFFF', height: '70%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalContentDark: { backgroundColor: '#1E1E1E' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  closeText: { color: '#ff7920', fontSize: 16, fontWeight: 'bold' },
  tocItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  tocText: { fontSize: 16 },
  
  settingsBox: { backgroundColor: '#FFFFFF', paddingTop: 24, paddingHorizontal: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  settingsLabel: { textAlign: 'center', marginBottom: 10, fontWeight: 'bold', color: '#6B6E62' },
  row: { flexDirection: 'row', justifyContent: 'center' },
  controlBtn: { padding: 15, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8, marginHorizontal: 10, flex: 1, alignItems: 'center' },
  activeBtn: { borderWidth: 1, borderColor: '#8C887F' }
});