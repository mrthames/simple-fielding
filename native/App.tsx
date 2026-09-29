import { StatusBar } from 'expo-status-bar';
import { Paths } from 'expo-file-system';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

// The web app from ../app, copied into the native project at prebuild (plugins/with-web-app.js)
const webRoot = Platform.OS === 'android'
  ? 'file:///android_asset/www/'
  : Paths.bundle.uri.replace(/\/?$/, '/') + 'www.bundle/';

// Remote inspection only in builds that ask for it (eas.json "preview" profile), never in store builds
const inspectable = process.env.EXPO_PUBLIC_WEBVIEW_DEBUG === '1';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <WebView
        style={styles.web}
        source={{ uri: webRoot + 'index.html' }}
        originWhitelist={['*']}
        allowFileAccess
        allowingReadAccessToURL={webRoot}
        domStorageEnabled
        webviewDebuggingEnabled={inspectable}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  web: { flex: 1 },
});
