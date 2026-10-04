/* global jest */
// No native window metrics under Jest; the library ships this mock for exactly that.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
