/**
 * Web 构建配置（react-native-web + webpack）
 * 说明：
 * - 将 `react-native` 别名到 `react-native-web`，原生模块（react-native-fs、
 *   @react-native-documents/picker）在 Web 端不会被打包，因为导入统一走
 *   src/utils/importBook.web.ts。
 * - babel 只转译应用源码及少数以未编译形式发布的 RN 依赖。
 */

const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const appDirectory = path.resolve(__dirname);

// 需要经 babel 转译的模块：应用源码 + 少数发布未编译代码的 RN 包
const compileInclude = [
  path.resolve(appDirectory, 'index.web.js'),
  path.resolve(appDirectory, 'App.tsx'),
  path.resolve(appDirectory, 'src'),
  path.resolve(appDirectory, 'node_modules/react-native-vector-icons'),
];

module.exports = (_env, argv) => {
  const mode = argv && argv.mode ? argv.mode : 'development';
  const isProd = mode === 'production';

  return {
    mode,
    entry: path.resolve(appDirectory, 'index.web.js'),
    output: {
      path: path.resolve(appDirectory, 'dist'),
      filename: isProd ? '[name].[contenthash].js' : '[name].js',
      publicPath: '/',
      clean: true,
    },
    devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
    module: {
      rules: [
        {
          // @react-navigation 等以 ESM 发布的包使用无扩展名相对导入，
          // webpack 5 默认对 ESM 强制完整扩展名，这里放开。
          test: /\.m?js$/,
          resolve: { fullySpecified: false },
        },
        {
          test: /\.[jt]sx?$/,
          include: compileInclude,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              // 隔离原生的 metro 预设（babel.config.js），Web 端只用下面这套
              configFile: false,
              babelrc: false,
              presets: [
                ['@babel/preset-env', { targets: 'defaults' }],
                ['@babel/preset-react', { runtime: 'automatic' }],
                '@babel/preset-typescript',
              ],
            },
          },
        },
        {
          test: /\.(png|jpe?g|gif|svg|ttf|otf|woff2?)$/,
          type: 'asset/resource',
        },
      ],
    },
    resolve: {
      extensions: [
        '.web.tsx',
        '.web.ts',
        '.web.js',
        '.tsx',
        '.ts',
        '.js',
        '.jsx',
        '.json',
      ],
      alias: {
        'react-native$': 'react-native-web',
        // 可选依赖：手势库在缺失 reanimated 时会优雅降级，Web 端未使用，
        // 别名到空模块以消除 "Can't resolve 'react-native-reanimated'" 警告。
        'react-native-reanimated': false,
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(appDirectory, 'public/index.html'),
      }),
      new webpack.DefinePlugin({
        __DEV__: JSON.stringify(!isProd),
        'process.env.NODE_ENV': JSON.stringify(mode),
      }),
    ],
    devServer: {
      static: { directory: path.resolve(appDirectory, 'public') },
      historyApiFallback: true,
      hot: true,
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 8080,
      client: {
        overlay: { errors: true, warnings: false },
      },
    },
  };
};
