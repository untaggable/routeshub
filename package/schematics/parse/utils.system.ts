import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import * as ts from 'typescript';

const getTsConfig = (content: any): ts.ParsedCommandLine => {
  // todo maybe optimize it
  const parseConfigHost: ts.ParseConfigHost = {
    fileExists: existsSync,
    readDirectory: ts.sys.readDirectory,
    readFile: file => readFileSync(file, 'utf8'),
    useCaseSensitiveFileNames: true
  };

  return ts.parseJsonConfigFileContent(
    content,
    parseConfigHost,
    resolve(dirname('tsconfig.json')),
    {
      noEmit: true
    }
  );
};

export const getProgram = (tsConfigContent: string): ts.Program => {
  const config = getTsConfig(tsConfigContent);
  // todo remove host
  const host = ts.createCompilerHost(config.options, true);
  return ts.createProgram(config.fileNames, config.options, host);
};
