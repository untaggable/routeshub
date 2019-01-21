import { indexer } from './indexer';
import { Entity, Params, Routes, Structure } from '../interfaces';

/**
 * Core function
 * Generates unique routes
 */
export function entitify<T, C = {}>(
  parentEntity: Structure | null,
  routes: Routes<T, C | {}>
): Entity<T> {
  return Object.keys(routes).reduce((acc: any, routeName: string): Entity<
    T
  > => {
    const { path, children, lazyPath } = routes[routeName];
    const id = indexer();
    const parentId = parentEntity !== null ? parentEntity.id : null;
    const state =
      parentEntity !== null
        ? setNotEmptyPath(parentEntity.state, path)
        : setNotEmptyPath(['/'], path);

    const route = {
      id,
      parentId,
      state,
      stateFn,
      path,
      lazyPath,
      routeName
    };

    return {
      ...acc,
      [routeName]: {
        ...route,
        children: children !== undefined ? entitify(route, children) : null
      }
    };
  }, {});
}

/**
 * State function that takes input args and outputs dynamic state value
 */
function stateFn(params?: Params, ...rest: Params[]): string[] {
  if (!params) {
    return;
  }

  if (rest.length === 0) {
    return handleState(params, this.state);
  }

  const parameters = rest.length === 0 ? params : reduceParams(params, rest);

  return handleState(parameters, this.state);
}

/**
 * Replaces property with value
 * Helps stateFn generate dynamic values
 */
const handleState = (params: Params, state?: string[]): string[] =>
  Object.keys(params).reduce(
    (accState: string[], param: string): string[] =>
      accState.map(
        (slice: string): string =>
          slice === `:${param}` ? params[param] : slice
      ),
    state
  );

/**
 * Absorbs and gives out together params
 */
const reduceParams = (params: Params, restParams: Params[]): Params =>
  restParams.reduce(
    (accParams: Params, param: Params): Params => ({
      ...accParams,
      ...param
    }),
    params
  );

/**
 * Prevents to record empty state paths
 */
function setNotEmptyPath(state: string[], path: string): string[] {
  return path !== '' ? [...state, path] : state;
}
