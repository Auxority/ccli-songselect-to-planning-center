import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import CopyPlugin from "copy-webpack-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default (env) => {
  const browser = env.browser || "chrome";
  
  return {
    entry: {
      "content/content": "./src/content/content.ts",
      "background/background": "./src/background/background.ts",
      "popup/popup": "./src/popup/popup.ts"
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: [".ts", ".js"],
    },
    output: {
      filename: "[name].js",
      path: resolve(__dirname, `dist/${browser}`),
      clean: true
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          // Common files
          { from: "src/icons", to: "icons" },
          { from: "src/popup/popup.html", to: "popup/popup.html" },
          { from: "src/popup/popup.css", to: "popup/popup.css" },
          { from: "src/templates", to: "templates" },
          { from: "src/content/styles.css", to: "content/styles.css" },

          // Browser-specific manifest - corrected path
          { 
            from: `manifests/manifest.${browser}.json`, 
            to: "manifest.json" 
          },
        ],
      }),
    ],
    devtool: "source-map"
  };
};