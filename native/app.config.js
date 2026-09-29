// The store apps carry the web app's version (../package.json), so the two never drift apart.
// Everything else is in app.json.
const { version } = require('../package.json');

module.exports = ({ config }) => ({ ...config, version });
