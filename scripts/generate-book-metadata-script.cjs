/* eslint-env node, es2017 */
// Hermes 的 Function.toString() 只返回 [bytecode]；构建前从同一 TS 源生成静态注入脚本。
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src/services/recognize/bookMetadata.ts');
const targetPath = path.join(
  root,
  'src/services/recognize/bookMetadataScript.generated.ts',
);

function generateMetadataScript() {
  const compiled = ts
    .transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        removeComments: true,
      },
    })
    .outputText.replace(
      'export function extractBookMetadata',
      'function extractBookMetadata',
    )
    .trim();
  // 单一纯函数是注入边界：新增模块级依赖或导出时直接报错，不能让真机再次悄悄回退。
  if (
    !compiled.startsWith('function extractBookMetadata(') ||
    /\b(?:import|export)\s/.test(compiled)
  )
    throw new Error(
      'bookMetadata 必须只包含类型与自包含的 extractBookMetadata 函数',
    );
  return (
    '// 此文件由 npm run generate:metadata-script 生成，请修改 bookMetadata.ts。\n' +
    `export const BOOK_METADATA_EXTRACTOR_JS =\n  ${JSON.stringify(
      compiled,
    )};\n`
  );
}

if (require.main === module) {
  const generated = generateMetadataScript();
  if (
    !fs.existsSync(targetPath) ||
    fs.readFileSync(targetPath, 'utf8') !== generated
  )
    fs.writeFileSync(targetPath, generated);
}
module.exports = { generateMetadataScript, targetPath };
