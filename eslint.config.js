// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Monorepo: resolve each app's tsconfig paths (e.g. `@/`) from the root.
    settings: {
      "import/resolver": {
        typescript: { project: ["apps/*/tsconfig.json"] },
      },
    },
  },
]);
