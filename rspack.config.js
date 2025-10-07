import dotenv from 'dotenv';
dotenv.config();

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';

export default {
  entry: './index.js',
  mode: isProd ? 'production' : 'development',
  devtool: isProd ? false : 'source-map',
  output: {
    filename: process.env.OUTPUT_FILE_NAME || 'markdown-editor.min.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  optimization: {
    splitChunks: false,
    runtimeChunk: false,
  },
  devServer: {
    static: {
      directory: path.join(__dirname),
    },
    compress: true,
    port: process.env.PORT || 3000,
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          {
            loader: 'style-loader',
          },
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
              sourceMap: !isProd,
            },
          },
        ],
      },
      {
        test: /\.js$/,
        // We still allow transpilation but also force dynamic imports to be bundled eagerly
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: {
                syntax: 'ecmascript',
              },
            },
          },
        },
        parser: {
          javascript: {
            dynamicImportMode: 'eager',
          },
        },
      },
    ],
  },
  resolve: {
    modules: [path.resolve(__dirname, 'node_modules'), 'node_modules'],
  },
};
