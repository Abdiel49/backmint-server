import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const outputPath = 'src/generated/backmint-api.d.ts';
const content = await readFile(outputPath, 'utf8');
const sourceFile = ts.createSourceFile(
  outputPath,
  content,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const printer = ts.createPrinter({ removeComments: true });

await writeFile(outputPath, `${printer.printFile(sourceFile).trimEnd()}\n`);
