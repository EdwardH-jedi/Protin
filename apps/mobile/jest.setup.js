/**
 * jest setup — runs before every test file, before the testing framework
 * is set up. Required after the Expo SDK 52 → 53 upgrade because SDK 53's
 * `expo` package adds a "winter" runtime polyfill (TextDecoder, URL,
 * `__ExpoImportMetaRegistry`, etc.) that runs at import time and walks
 * into `react-native/Libraries/BatchedBridge/NativeModules.js`. That
 * module throws an invariant if `global.__fbBatchedBridgeConfig` is
 * unset, which is the state inside jest.
 *
 * Pre-seeding the bridge config and the proxy short-circuits both
 * branches of the invariant so the winter runtime can register its
 * polyfills without trying to talk to a real native bridge.
 */
if (typeof global.__fbBatchedBridgeConfig === 'undefined') {
  global.__fbBatchedBridgeConfig = {
    remoteModuleConfig: [],
    localModulesConfig: [],
  };
}

if (typeof global.nativeModuleProxy === 'undefined') {
  global.nativeModuleProxy = new Proxy(
    {},
    {
      get: () => () => undefined,
    }
  );
}
