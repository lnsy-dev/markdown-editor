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
  output: {
    filename: process.env.OUTPUT_FILE_NAME || 'markdown-editor.min.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
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
        exclude: /node_modules/,
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
      },
    ],
  },
  resolve: {
    modules: [path.resolve(__dirname, 'node_modules'), 'node_modules'],
  },
};
