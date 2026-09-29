import { StatusBar } from 'expo-status-bar';
import { Paths } from 'expo-file-system';
import { useEffect, useRef } from 'react';
import { BackHandler, KeyboardAvoidingView, Linking, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

// The web app from ../app, copied into the native project at prebuild (plugins/with-web-app.js)
const webRoot = Platform.OS === 'android'
  ? 'file:///android_asset/www/'
  : Paths.bundle.uri.replace(/\/?$/, '/') + 'www.bundle/';
// The web app's own links to the website (../, ../articles/) resolve to the folder around it. They go to the website.
const siteRoot = webRoot.replace(/[^/]+\/$/, '');
const SITE = 'https://simplefielding.com/';
const NAVY = '#0b1c3a';   // the app's header (--brand-deep)

// Remote inspection only in builds that ask for it (eas.json "preview" profile), never in store builds
const inspectable = process.env.EXPO_PUBLIC_WEBVIEW_DEBUG === '1';

function Shell() {
  const insets = useSafeAreaInsets();
  const web = useRef<WebView>(null);

  // The page lays out its own top and bottom: the navy header runs up behind the status bar, and the panel keeps
  // clear of the home indicator. It reads the edges as --safe-top and --safe-bottom, which Android's WebView leaves
  // at zero, so the app sets them. Left and right (landscape) are kept clear here, in navy.
  const edges = `(function(){var s=document.documentElement.style;s.setProperty('--safe-top','${insets.top}px');s.setProperty('--safe-bottom','${insets.bottom}px');})();true;`;
  useEffect(() => { web.current?.injectJavaScript(edges); }, [edges]);

  // Android's back button closes what's open in the app first (SimpleFielding.back), and closes the app when nothing is.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      web.current?.injectJavaScript(
        "window.ReactNativeWebView.postMessage(window.SimpleFielding && window.SimpleFielding.back() ? 'back:handled' : 'back:exit');true;");
      return true;
    });
    return () => sub.remove();
  }, []);
  const onMessage = (e: WebViewMessageEvent) => {
    if (e.nativeEvent.data === 'back:exit') BackHandler.exitApp();
  };

  // Everything outside the web app opens in the phone's browser (or mail app); the website's own pages go to the site.
  const onShouldStart = (req: ShouldStartLoadRequest) => {
    const { url } = req;
    if (url.startsWith(webRoot) || url.startsWith('about:')) return true;
    const out = url.startsWith(siteRoot) ? SITE + url.slice(siteRoot.length) : url;
    if (/^(https?|mailto):/.test(out)) Linking.openURL(out);
    return false;
  };

  return (
    <View style={[styles.container, { paddingLeft: insets.left, paddingRight: insets.right }]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'android' ? 'padding' : undefined}>
        <WebView
          ref={web}
          style={styles.fill}
          source={{ uri: webRoot + 'index.html' }}
          originWhitelist={['*']}
          allowFileAccess
          allowingReadAccessToURL={webRoot}
          domStorageEnabled
          injectedJavaScriptBeforeContentLoaded={edges}
          onShouldStartLoadWithRequest={onShouldStart}
          setSupportMultipleWindows={false}
          onMessage={onMessage}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          overScrollMode="never"
          bounces={false}
          webviewDebuggingEnabled={inspectable}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  fill: { flex: 1 },
});
