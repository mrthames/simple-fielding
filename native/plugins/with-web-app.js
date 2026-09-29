// Copies the web app (../app) into the native projects at prebuild, so the store apps ship it and work offline.
//
// Android: android/app/src/main/assets/www/  ->  file:///android_asset/www/index.html
// iOS:     ios/<Project>/www.bundle/ as a resource  ->  <app bundle>/www.bundle/index.html
//          (the ".bundle" name makes Xcode copy the whole folder as-is, subfolders included)
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject, IOSConfig } = require('@expo/config-plugins');

const WEB_APP = path.resolve(__dirname, '..', '..', 'app');

function copyWebApp(dest) {
  if (!fs.existsSync(path.join(WEB_APP, 'index.html'))) {
    throw new Error(`with-web-app: no index.html in ${WEB_APP}`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(WEB_APP, dest, { recursive: true });
  markNative(path.join(dest, 'index.html'));
}

// Tells the web app it's running inside the store app (app.js reads window.SF_NATIVE), before any of its
// scripts run. The store apps send nothing anywhere, so tester reporting stays off in them.
function markNative(indexHtml) {
  const html = fs.readFileSync(indexHtml, 'utf8');
  const first = html.indexOf('<script src=');
  if (first < 0) throw new Error('with-web-app: no <script src=...> in index.html to mark as native');
  fs.writeFileSync(indexHtml, html.slice(0, first) + '<script>window.SF_NATIVE = true;</script>\n' + html.slice(first));
}

const withAndroidWebApp = (config) =>
  withDangerousMod(config, ['android', (cfg) => {
    copyWebApp(path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'www'));
    return cfg;
  }]);

const withIosWebApp = (config) => {
  config = withDangerousMod(config, ['ios', (cfg) => {
    copyWebApp(path.join(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName, 'www.bundle'));
    return cfg;
  }]);
  return withXcodeProject(config, (cfg) => {
    const name = cfg.modRequest.projectName;
    if (!cfg.modResults.hasFile(`${name}/www.bundle`)) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: `${name}/www.bundle`,
        groupName: name,
        project: cfg.modResults,
        isBuildFile: true,
      });
    }
    return cfg;
  });
};

module.exports = (config) => withIosWebApp(withAndroidWebApp(config));
