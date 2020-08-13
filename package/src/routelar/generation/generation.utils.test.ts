import { excludeRoot, flatRoutes } from './generation.utils';

describe('[generation] utils', () => {
  describe('flatRoutes', () => {
    test('should return the same when no root', () => {
      expect(
        flatRoutes({
          home: {},
          location: {}
        })
      ).toEqual({
        home: {},
        location: {}
      });
    });

    test('should return the same when empty root', () => {
      expect(
        flatRoutes({
          root: {},
          home: {},
          location: {}
        })
      ).toEqual({
        root: {},
        home: {},
        location: {}
      });
    });

    test('should flat one lvl deep nested routes inside root', () => {
      expect(
        flatRoutes({
          root: {
            map: {},
            car: {}
          },
          home: {},
          location: {}
        })
      ).toEqual({
        location: {},
        home: {},
        map: {},
        car: {}
      });
    });

    test('should flat one lvl deep nested routes inside root with empty root', () => {
      expect(
        flatRoutes({
          root: {
            root: {},
            map: {},
            car: {}
          },
          home: {},
          location: {}
        })
      ).toEqual({
        root: {},
        location: {},
        home: {},
        map: {},
        car: {}
      });
    });

    test('should flat two lvl deep nested routes inside root', () => {
      expect(
        flatRoutes({
          root: {
            root: {
              map: {},
              car: {}
            }
          },
          home: {},
          location: {}
        })
      ).toEqual({
        location: {},
        home: {},
        map: {},
        car: {}
      });
    });

    test('should flat two lvl deep nested routes inside root with empty root', () => {
      expect(
        flatRoutes({
          root: {
            root: {
              root: {},
              map: {},
              car: {}
            }
          },
          home: {},
          location: {}
        })
      ).toEqual({
        root: {},
        location: {},
        home: {},
        map: {},
        car: {}
      });
    });

    test('should flat two lvl deep nested routes inside root with root', () => {
      expect(
        flatRoutes({
          root: {
            root: {
              root: {
                nest: {}
              },
              map: {},
              car: {}
            }
          },
          home: {},
          location: {}
        })
      ).toEqual({
        nest: {},
        location: {},
        home: {},
        map: {},
        car: {}
      });
    });
  });

  describe('excludeRoot', () => {
    test('should return the same data when there is no root prop', () => {
      expect(
        excludeRoot({
          home: {},
          location: {}
        })
      ).toEqual({
        home: {},
        location: {}
      });
    });

    test('should return return data without root prop', () => {
      expect(
        excludeRoot({
          root: {},
          home: {},
          location: {}
        })
      ).toEqual({
        home: {},
        location: {}
      });
    });
  });
});
