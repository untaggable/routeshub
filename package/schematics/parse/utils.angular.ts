import { Tree } from '@angular-devkit/schematics';
import { WorkspaceSchema } from '@angular-devkit/core/src/experimental/workspace';
import * as ts from 'typescript';
import { dirname, resolve } from 'path';
import { FindMainModuleOptions, NodeWithFile, RouterExpression } from './types';

const findAngularJSON = (tree: Tree): WorkspaceSchema => {
  const angularJson = tree.read('angular.json');
  if (!angularJson) {
    throw new Error("angular.json doesn't exist");
  }

  const content = angularJson.toString();
  return JSON.parse(content) as WorkspaceSchema;
};

const findMainFile = ({
  tree,
  program,
  project
}: FindMainModuleOptions): ts.SourceFile => {
  const angularJson = findAngularJSON(tree);
  const workspace = angularJson.projects[project];
  const relativeMainPath = workspace?.architect?.build?.options?.main || '';
  const absoluteMainPath = resolve(relativeMainPath);

  const mainFile = program
    .getSourceFiles()
    .find(sourceFile => sourceFile.fileName === absoluteMainPath);

  if (!mainFile) {
    throw new Error("Can't find main file");
  }

  return mainFile;
};

const tryFindMainModule = (
  node: ts.Node,
  program: ts.Program
): string | null => {
  if (ts.isIdentifier(node) && node.text === 'bootstrapModule') {
    const propAccess = node.parent;
    if (!propAccess || !ts.isPropertyAccessExpression(propAccess)) {
      return null;
    }

    const tempExpr = propAccess.parent;
    if (!tempExpr || !ts.isCallExpression(tempExpr)) {
      return null;
    }

    const module = tempExpr.arguments[0];
    const typeChecker = program.getTypeChecker();
    const symbol = typeChecker.getTypeAtLocation(module).getSymbol();
    if (!symbol) {
      return null;
    }

    const declarations = symbol.getDeclarations();
    if (!declarations) {
      return null;
    }

    return resolve(declarations[0].getSourceFile().fileName);
  }

  let mainPath: null | string = null;
  node.forEachChild(nextNode => {
    if (mainPath) {
      return mainPath;
    }
    mainPath = tryFindMainModule(nextNode, program);
  });

  return mainPath;
};

const getRouterDefinitionsFile = (program: ts.Program): ts.SourceFile => {
  const routerDefinitionsFile = program
    .getSourceFiles()
    .filter(file => file.fileName.includes('angular/router'))
    .find(file => file.fileName.includes('router.d.ts'));

  if (routerDefinitionsFile) {
    return routerDefinitionsFile;
  } else {
    throw new Error("Angular router didn't find");
  }
};

// todo refactor
export const getRouterModuleType = (
  program: ts.Program,
  typeChecker: ts.TypeChecker
): ts.Type => {
  const routerDefinitions = getRouterDefinitionsFile(program);

  let routerModule: null | ts.Identifier = null;
  routerDefinitions.forEachChild(node => {
    if (ts.isClassDeclaration(node) && node?.name?.text === 'RouterModule') {
      routerModule = node.name;
    }
  });

  if (!routerModule) {
    throw new Error("Router module doesn't exist");
  }

  const symbol = typeChecker.getTypeAtLocation(routerModule).getSymbol();
  if (symbol) {
    return typeChecker.getDeclaredTypeOfSymbol(symbol);
  } else {
    throw new Error("Router symbol didn't find");
  }
};

const isRouterModule = (
  typeChecker: ts.TypeChecker,
  routerType: ts.Type,
  node: ts.Node
): boolean => {
  if (ts.isIdentifier(node)) {
    const symbol = typeChecker.getTypeAtLocation(node).getSymbol();
    if (symbol) {
      const nodeType = typeChecker.getDeclaredTypeOfSymbol(symbol);
      if (nodeType === routerType) {
        return true;
      }
    }
  }

  return false;
};

const getRouteModuleIdentifiers = (
  program: ts.Program
): NodeWithFile<ts.Identifier>[] => {
  const typeChecker = program.getTypeChecker();
  const routerType = getRouterModuleType(program, typeChecker);

  const routesUsage: NodeWithFile<ts.Identifier>[] = [];
  function routerVisitor(file: ts.SourceFile, node: ts.Node): void {
    if (isRouterModule(typeChecker, routerType, node)) {
      routesUsage.push({ node: node as ts.Identifier, file });
    } else {
      node.forEachChild(child => routerVisitor(file, child));
    }
  }

  program.getSourceFiles().forEach(sourceFile => {
    sourceFile.forEachChild(node => routerVisitor(sourceFile, node));
  });

  return routesUsage;
};

function findRouterCallExpression(node: ts.Node): ts.CallExpression | null {
  const { parent } = node;
  if (parent && ts.isCallExpression(parent)) {
    return parent;
  } else if (parent && ts.isPropertyAccessExpression(parent)) {
    return findRouterCallExpression(parent);
  }

  return null;
}

function hasExpression(node: ts.Node, expression: RouterExpression): boolean {
  const { parent } = node;
  if (parent && ts.isPropertyAccessExpression(parent)) {
    const { name } = parent;
    return name.text === expression ? true : hasExpression(parent, expression);
  }

  return false;
}

const getRouterCallExpressions = (
  expression: RouterExpression,
  routeModules: NodeWithFile<ts.Identifier>[]
): NodeWithFile<ts.CallExpression>[] => {
  return routeModules
    .filter(({ node }) => hasExpression(node, expression))
    .map(({ node, file }) => ({
      node: findRouterCallExpression(node),
      file
    }))
    .filter(({ node }) => !!node)
    .map(node => node as NodeWithFile<ts.CallExpression>);
};

export const getImportDeclarationForId = (
  node: ts.Node
): ts.ImportDeclaration | null => {
  const { parent } = node;
  if (parent) {
    if (ts.isImportDeclaration(parent)) {
      return parent;
    } else {
      return getImportDeclarationForId(parent);
    }
  }

  return null;
};

export const getFileWithId = (
  node: ts.ImportDeclaration,
  program: ts.Program,
  relativeFile: string
): ts.SourceFile | null => {
  const { moduleSpecifier } = node;
  if (ts.isStringLiteral(moduleSpecifier)) {
    const dir = dirname(relativeFile);
    const relativePath = moduleSpecifier.text;
    const absolutePath = resolve(dir, relativePath);

    return (
      program
        .getSourceFiles()
        .find(file => file.fileName.includes(absolutePath)) || null
    );
  }

  return null;
};

const tryFindIdentifierValue = (
  program: ts.Program,
  nodeWithFile: NodeWithFile<ts.Identifier>,
  checkPosition: boolean = false
): ts.ArrayLiteralExpression | undefined => {
  const identifier = nodeWithFile.node;
  const ids: NodeWithFile<ts.Identifier>[] = [];

  function visitor(node: ts.Node): void {
    if (
      ts.isIdentifier(node) &&
      node.text === identifier.text &&
      (checkPosition ? node.pos !== identifier.pos : true)
    ) {
      ids.push({ node, file: nodeWithFile.file });
    } else {
      node.forEachChild(visitor);
    }
  }

  nodeWithFile.file?.forEachChild(visitor);

  return ids.map(({ node }) => {
    const { parent } = node;
    if (ts.isVariableDeclaration(parent)) {
      const { initializer } = parent;
      if (initializer && ts.isArrayLiteralExpression(initializer)) {
        return initializer;
      }
    } else if (ts.isImportSpecifier(parent)) {
      // todo also need to see cases like import * as & import variable as
      const importDecl = getImportDeclarationForId(parent);
      if (importDecl) {
        const fileWithDefinition = getFileWithId(
          importDecl,
          program,
          nodeWithFile.file.fileName
        );

        if (fileWithDefinition) {
          return tryFindIdentifierValue(
            program,
            {
              node: identifier,
              file: fileWithDefinition
            },
            false
          );
        }
      }
    }
  })?.[0];
};

const getRoutes = (
  program: ts.Program,
  routeModules: NodeWithFile<ts.Identifier>[],
  forRoot: boolean
) => {
  const expression = forRoot ? 'forRoot' : 'forChild';
  const expressions = getRouterCallExpressions(expression, routeModules);

  return expressions.map(expr => {
    const arg = expr.node.arguments[0];
    if (ts.isArrayLiteralExpression(arg)) {
      return arg;
    } else if (ts.isIdentifier(arg)) {
      console.log('try find: ', arg.text);
      return tryFindIdentifierValue(
        program,
        {
          node: arg,
          file: expr.file
        },
        true
      );
    }
  });
};

export const findAppModule = ({
  tree,
  program,
  project
}: FindMainModuleOptions): string => {
  const mainFile = findMainFile({ tree, program, project });

  // todo change
  const routesModules = getRouteModuleIdentifiers(program);
  const routes = getRoutes(program, routesModules, true);
  console.log(routes.map(route => route?.elements?.length));

  const appModulePath = tryFindMainModule(mainFile, program);
  return appModulePath || '';
};
