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
const { execFile } = require('child_process');
const { webDavProxy } = require('./scripts/webdavProxy');

const appDirectory = path.resolve(__dirname);

// 需要经 babel 转译的模块：应用源码 + 少数发布未编译代码的 RN 包
const compileInclude = [
  path.resolve(appDirectory, 'index.web.js'),
  /App(\.web)?\.tsx$/,
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
    devtool: isProd ? false : 'eval-cheap-module-source-map',
    optimization: isProd
      ? {
          splitChunks: {
            chunks: 'all',
            // React Navigation/RN Web 的公共依赖较大；限制单个 vendor chunk，
            // 改善长期缓存与并行加载，避免一个 600KB 文件阻塞首屏。
            maxSize: 350 * 1024,
            cacheGroups: {
              vendor: {
                test: /[\\/]node_modules[\\/]/,
                name: 'vendor',
                priority: 10,
              },
            },
          },
        }
      : undefined,
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
    performance: isProd
      ? {
          hints: 'warning',
          maxAssetSize: 400 * 1024,
          // 当前入口由多个按 350KB 拆分的公共 chunk 组成；超过 800KB 再报警。
          maxEntrypointSize: 800 * 1024,
        }
      : false,
    devServer: {
      static: { directory: path.resolve(appDirectory, 'public') },
      historyApiFallback: true,
      hot: true,
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 8080,
      client: {
        overlay: { errors: true, warnings: false },
      },
      // 网络书源代理：浏览器直连书源站点会被 CORS 拦截，Web 端把请求发到同源的
      // /proxy/<host>/<path>（见 services/http/fetchHtml.web.ts），由此转发到真实站点。
      // 通用前缀，新增书源无需改中间件，只需把域名加进 ALLOWED_HOSTS 白名单。
      // 生产 Web 需由反向代理（nginx / deploy/server.js）提供同名前缀。
      //
      // Cloudflare 会通过 TLS 指纹（JA3）拦截 Node.js http-proxy 的请求，
      // 即使 header 完全伪装成手机端也会返回 403 challenge。
      // 改用 curl 子进程转发——curl 的 TLS 指纹被 Cloudflare 放行。
      setupMiddlewares: (middlewares, _devServer) => {
        // 白名单：只代理已登记书源和固定搜索引擎，避免变成开放代理被滥用。
        const ALLOWED_HOSTS = [
          /(^|\.)bookshuku\.org$/i,
          /(^|\.)mingzw\.net$/i,
          /^html\.duckduckgo\.com$/i,
          /^www\.bing\.com$/i,
        ];
        const MOBILE_UA =
          'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';

        middlewares.unshift({
          name: 'source-proxy',
          path: '/proxy',
          middleware: (req, res, next) => {
            // path:'/proxy' 已被剥掉，此时 req.url 形如 /<scheme>/<host>/<上游路径>
            const m = /^\/(https?)\/([^/]+)(\/.*)?$/.exec(req.url || '');
            const host = m && m[2].toLowerCase();
            if (!host || !ALLOWED_HOSTS.some(re => re.test(host))) {
              res.writeHead(host ? 403 : 400, { 'content-type': 'text/plain' });
              res.end(host ? 'Host not allowed' : 'Bad proxy path');
              return;
            }
            const target = `${m[1]}://${host}${m[3] || '/'}`;

            execFile(
              'curl',
              [
                '-s',
                '-L',
                '--max-redirs',
                '3',
                '--connect-timeout',
                '10',
                '--max-time',
                '15',
                '-H',
                `User-Agent: ${MOBILE_UA}`,
                '-H',
                'Accept: text/html',
                target,
              ],
              { timeout: 20000, maxBuffer: 10 * 1024 * 1024 },
              (err, stdout, stderr) => {
                if (err) {
                  console.error('[source-proxy] curl error:', err.message);
                  res.writeHead(502, { 'content-type': 'text/plain' });
                  res.end('Proxy upstream error');
                  return;
                }
                res.writeHead(200, {
                  'content-type': 'text/html; charset=utf-8',
                  'cache-control': 'no-store',
                });
                res.end(stdout);
              },
            );
          },
        });

        middlewares.unshift({
          name: 'webdav-proxy',
          path: '/api/webdav',
          middleware: webDavProxy,
        });

        return middlewares;
      },
    },
  };
};
